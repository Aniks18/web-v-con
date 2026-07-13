FROM python:3.11-slim

WORKDIR /app

# Copy requirements and install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Create data directory
RUN mkdir -p data

# Expose port
EXPOSE 8000

# Run the application. Shell form so ${PORT} (injected by most PaaS) is honored,
# defaulting to 8000 for local runs. Single worker: signaling state is in-memory.
CMD uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000} --workers 1
