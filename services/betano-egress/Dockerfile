FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY app.py ./
RUN useradd --system --no-create-home --uid 10001 egress
USER egress
ENV HOST=0.0.0.0 PORT=8765
EXPOSE 8765
CMD ["python", "app.py"]
