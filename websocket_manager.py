"""WebSocket connection manager and signaling logic."""
from fastapi import WebSocket
from typing import Dict, Set
import json
import asyncio
from datetime import datetime
from room_manager import room_manager


class ConnectionManager:
    """Manages WebSocket connections and signaling."""
    
    def __init__(self):
        # socket_id -> WebSocket
        self.active_connections: Dict[str, WebSocket] = {}
        # socket_id -> room_code
        self.socket_to_room: Dict[str, str] = {}
    
    async def connect(self, websocket: WebSocket, socket_id: str):
        """Accept a new WebSocket connection."""
        await websocket.accept()
        self.active_connections[socket_id] = websocket
    
    def disconnect(self, socket_id: str):
        """Remove a WebSocket connection."""
        if socket_id in self.active_connections:
            del self.active_connections[socket_id]
        
        # Remove from room
        if socket_id in self.socket_to_room:
            room_code = self.socket_to_room[socket_id]
            room_manager.remove_participant(room_code, socket_id)
            del self.socket_to_room[socket_id]
    
    async def send_message(self, socket_id: str, message: dict):
        """Send a message to a specific socket."""
        if socket_id in self.active_connections:
            try:
                await self.active_connections[socket_id].send_json(message)
            except Exception as e:
                print(f"Error sending to {socket_id}: {e}")
                self.disconnect(socket_id)
    
    async def broadcast_to_room(self, room_code: str, message: dict, exclude: Set[str] = None):
        """Broadcast a message to all participants in a room."""
        if exclude is None:
            exclude = set()
        
        room = room_manager.get_room(room_code)
        if not room:
            return
        
        tasks = []
        for socket_id in room.participants.keys():
            if socket_id not in exclude:
                tasks.append(self.send_message(socket_id, message))
        
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)
    
    async def handle_join_room(self, socket_id: str, data: dict):
        """Handle a user joining a room."""
        room_code = data.get("room_code")
        display_name = data.get("display_name", "Anonymous")
        
        if not room_code:
            await self.send_message(socket_id, {
                "type": "error",
                "payload": {"code": "MISSING_ROOM_CODE", "message": "Room code is required"}
            })
            return
        
        # Check if room exists
        room = room_manager.get_room(room_code)
        if not room:
            await self.send_message(socket_id, {
                "type": "error",
                "payload": {"code": "ROOM_NOT_FOUND", "message": f"Room {room_code} not found"}
            })
            return
        
        # Check if room is open
        if room.state != "open":
            await self.send_message(socket_id, {
                "type": "error",
                "payload": {"code": "ROOM_CLOSED", "message": "Room is closed"}
            })
            return
        
        # Check if expired
        if room.is_expired():
            await self.send_message(socket_id, {
                "type": "error",
                "payload": {"code": "ROOM_EXPIRED", "message": "Room has expired"}
            })
            return
        
        # Add participant
        room = room_manager.add_participant(room_code, socket_id, display_name)
        if not room:
            await self.send_message(socket_id, {
                "type": "error",
                "payload": {"code": "ROOM_FULL", "message": "Room is full"}
            })
            return
        
        # Track socket to room mapping
        self.socket_to_room[socket_id] = room_code
        
        # Get list of existing peers (excluding the new joiner)
        existing_peers = [
            {"socket_id": p.socket_id, "display_name": p.display_name}
            for sid, p in room.participants.items() if sid != socket_id
        ]
        
        # Send joined confirmation to the new participant
        await self.send_message(socket_id, {
            "type": "joined",
            "payload": {
                "room_code": room_code,
                "your_socket_id": socket_id,
                "peers": existing_peers
            }
        })
        
        # Notify existing participants about the new peer
        await self.broadcast_to_room(room_code, {
            "type": "peer_joined",
            "payload": {
                "socket_id": socket_id,
                "display_name": display_name
            }
        }, exclude={socket_id})
    
    async def handle_leave_room(self, socket_id: str):
        """Handle a user leaving a room."""
        if socket_id not in self.socket_to_room:
            return
        
        room_code = self.socket_to_room[socket_id]
        
        # Remove participant
        room_manager.remove_participant(room_code, socket_id)
        del self.socket_to_room[socket_id]
        
        # Notify others
        await self.broadcast_to_room(room_code, {
            "type": "peer_left",
            "payload": {"socket_id": socket_id}
        })
    
    async def handle_signal(self, socket_id: str, data: dict):
        """Handle signaling messages (SDP/ICE)."""
        to_socket_id = data.get("to")
        signal_type = data.get("signal_type")
        payload = data.get("payload")
        
        if not to_socket_id or not signal_type or payload is None:
            await self.send_message(socket_id, {
                "type": "error",
                "payload": {"code": "INVALID_SIGNAL", "message": "Invalid signal message"}
            })
            return
        
        # Check both users are in the same room
        if socket_id not in self.socket_to_room:
            await self.send_message(socket_id, {
                "type": "error",
                "payload": {"code": "NOT_IN_ROOM", "message": "You are not in a room"}
            })
            return
        
        room_code = self.socket_to_room[socket_id]
        room = room_manager.get_room(room_code)
        
        if not room or to_socket_id not in room.participants:
            await self.send_message(socket_id, {
                "type": "error",
                "payload": {"code": "PEER_NOT_FOUND", "message": "Target peer not in room"}
            })
            return
        
        # Forward the signal
        await self.send_message(to_socket_id, {
            "type": "signal",
            "payload": {
                "from": socket_id,
                "signal_type": signal_type,
                "payload": payload
            }
        })
    
    async def handle_chat_message(self, socket_id: str, payload: dict):
        """Handle chat message and broadcast to all participants in the room."""
        # Find which room this socket is in
        room_code = None
        for code, participants in self.room_participants.items():
            if socket_id in participants:
                room_code = code
                break
        
        if not room_code:
            await self.send_message(socket_id, {
                "type": "error",
                "payload": {"code": "NOT_IN_ROOM", "message": "You are not in a room"}
            })
            return
        
        # Broadcast chat message to all participants (including sender for consistency)
        await self.broadcast_to_room(room_code, {
            "type": "chat_message",
            "payload": payload
        })
    
    async def handle_create_room(self, socket_id: str, data: dict):
        """Handle creating a new room via WebSocket (no API key needed)."""
        display_name = data.get("display_name", "Anonymous")
        max_participants = data.get("max_participants", 50)
        ttl_hours = data.get("ttl_hours", 24)
        
        # Create the room
        room = room_manager.create_room(
            owner_id=socket_id,
            ttl_hours=ttl_hours,
            max_participants=max_participants
        )
        
        # Automatically join the room
        room = room_manager.add_participant(room.room_code, socket_id, display_name)
        
        if room:
            # Track socket to room mapping
            self.socket_to_room[socket_id] = room.room_code
            
            # Send room created confirmation
            await self.send_message(socket_id, {
                "type": "room_created",
                "payload": {
                    "room_code": room.room_code,
                    "created_at": room.created_at.isoformat(),
                    "expires_at": room.expires_at.isoformat(),
                    "your_socket_id": socket_id
                }
            })
        else:
            await self.send_message(socket_id, {
                "type": "error",
                "payload": {"code": "ROOM_CREATION_FAILED", "message": "Failed to create room"}
            })
    
    async def handle_message(self, socket_id: str, message: str):
        """Route incoming WebSocket messages."""
        try:
            data = json.loads(message)
            msg_type = data.get("type")
            payload = data.get("payload", {})
            
            if msg_type == "create_room":
                await self.handle_create_room(socket_id, payload)
            elif msg_type == "join_room":
                await self.handle_join_room(socket_id, payload)
            elif msg_type == "leave_room":
                await self.handle_leave_room(socket_id)
            elif msg_type == "signal":
                await self.handle_signal(socket_id, payload)
            elif msg_type == "chat_message":
                await self.handle_chat_message(socket_id, payload)
            elif msg_type == "heartbeat":
                # Respond to heartbeat
                await self.send_message(socket_id, {"type": "pong"})
            else:
                await self.send_message(socket_id, {
                    "type": "error",
                    "payload": {"code": "UNKNOWN_MESSAGE_TYPE", "message": f"Unknown message type: {msg_type}"}
                })
        
        except json.JSONDecodeError:
            await self.send_message(socket_id, {
                "type": "error",
                "payload": {"code": "INVALID_JSON", "message": "Invalid JSON message"}
            })
        except Exception as e:
            print(f"Error handling message from {socket_id}: {e}")
            await self.send_message(socket_id, {
                "type": "error",
                "payload": {"code": "SERVER_ERROR", "message": "Internal server error"}
            })


# Global connection manager
connection_manager = ConnectionManager()
