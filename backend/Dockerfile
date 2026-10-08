FROM rust:1.99.0-slim-trixie AS build

WORKDIR /app
# The image already has the pinned toolchain; skip the clippy and rustfmt components rust-toolchain.toml asks for.
ENV RUSTUP_TOOLCHAIN=1.99.0
COPY backend/ ./
RUN cargo build --release --locked -p fsp-server -p fsp-integration-fsp-synthetic --bins

FROM debian:trixie-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl bubblewrap poppler-utils \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --system --uid 10001 --no-create-home fsp
COPY --from=build /app/target/release/fsp-career-api /usr/local/bin/fsp-career-api
COPY --from=build /app/target/release/fsp-simulator /usr/local/bin/fsp-simulator
ENV HOST=0.0.0.0 PORT=8080
USER fsp
EXPOSE 8080
CMD ["fsp-career-api"]
