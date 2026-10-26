# Bundles every dependency build.sh needs - pandoc, a Chromium binary, fontconfig and
# poppler-utils - so nothing has to be installed locally. See md2pdf for the one-off
# invocation this image is meant for.
#
# Forked from rise-md2pdf's Dockerfile, minus the python-pptx slide path.
FROM node:20-bookworm-slim

# Everything below is one layer on purpose: files deleted in a later layer still sit
# in the earlier one, so the image only actually shrinks if the install and the cleanup
# happen together.
#
# The cleanup strips what this image can never reach:
#
#   dri/, libLLVM, libz3   Mesa's software GL drivers and the LLVM + Z3 pair that only
#                          llvmpipe loads. print.js runs Chromium with --disable-gpu,
#                          so nothing ever opens a GL context. These can't be apt-purged
#                          (chromium-common hard-depends on libgl1-mesa-dri), hence rm.
#   libVkLayer_khronos_*   Vulkan validation layer - a debugging aid, 22 MB.
#   icons/                 Adwaita, pulled in as a GTK dependency. Headless Chromium
#                          draws no window chrome and no icons.
#   npm, yarn, corepack    print.js deliberately has no npm dependencies (it speaks CDP
#                          over Node's built-in WebSocket), so the image needs the node
#                          runtime but no package manager.
#
# fonts-dejavu-core stays: it's the fallback face for glyphs the avajadi fonts don't
# cover.
RUN apt-get update && apt-get install -y --no-install-recommends \
      pandoc \
      chromium \
      fontconfig \
      fonts-dejavu-core \
      poppler-utils \
      ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && rm -rf /usr/lib/*-linux-gnu/dri \
              /usr/lib/*-linux-gnu/libLLVM-*.so* \
              /usr/lib/*-linux-gnu/libz3.so* \
              /usr/lib/chromium/libVkLayer_khronos_validation.so \
              /usr/share/icons \
              /usr/share/doc \
              /usr/share/man \
              /usr/local/lib/node_modules \
              /usr/local/bin/npm /usr/local/bin/npx \
              /usr/local/bin/yarn /usr/local/bin/yarnpkg /usr/local/bin/corepack

WORKDIR /opt/avajadi-md2pdf
COPY build.sh print.js avajadi-doc.css avajadi-tokens.css ./
COPY fonts ./fonts
COPY assets/avajadi-mark.png ./assets/
RUN chmod +x build.sh print.js

# build.sh resolves its own directory via BASH_SOURCE, so it works regardless of
# WORKDIR - /work is just where a mounted host directory is expected to land.
WORKDIR /work
ENTRYPOINT ["/opt/avajadi-md2pdf/build.sh"]

# md2pdf passes version.txt here, so `md2pdf --version` can tell which version a built
# image is. A plain `docker build` without --build-arg leaves the label empty. Last on
# purpose: an ARG invalidates the cache of every RUN after it when its value changes.
ARG VERSION
LABEL org.opencontainers.image.version="$VERSION"
