FROM docker:29-cli
RUN apk add --no-cache python3 git openssh-client \
    && addgroup -g 1000 watchdog \
    && adduser -D -u 1000 -G watchdog watchdog
COPY watchdog.py /opt/watchdog.py
ENV PYTHONUNBUFFERED=1 HOME=/home/watchdog DOCKER_BUILDKIT=0
USER watchdog
ENTRYPOINT ["python3", "/opt/watchdog.py"]
