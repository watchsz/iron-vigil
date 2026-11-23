# Blender headless pour l'export .blend -> .glb (seule la build x64 existe sous Linux)
FROM --platform=linux/amd64 debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl xz-utils \
      libx11-6 libxi6 libxxf86vm1 libxfixes3 libxrender1 libxkbcommon0 libsm6 libice6 libgl1 libegl1 \
    && rm -rf /var/lib/apt/lists/*
RUN curl -fsSL https://download.blender.org/release/Blender5.3/blender-5.3.0-linux-x64.tar.xz | tar -xJ -C /opt \
    && ln -s /opt/blender-5.3.0-linux-x64/blender /usr/local/bin/blender
WORKDIR /app
CMD ["sh", "-c", "for f in assets-src/*.blend; do blender -b \"$f\" --python-exit-code 1 --python tools/blender/export.py -- public/assets || exit 1; done"]
