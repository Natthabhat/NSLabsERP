FROM docker:29-cli
RUN apk add --no-cache python3 git openssh-client
COPY watchdog.py /opt/watchdog.py
ENV PYTHONUNBUFFERED=1
ENTRYPOINT ["python3", "/opt/watchdog.py"]
