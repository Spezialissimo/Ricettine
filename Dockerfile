# syntax=docker/dockerfile:1

# --- Stage 1: Angular build (build stages run on the native builder platform; output is arch-independent) ---
FROM --platform=$BUILDPLATFORM node:24-alpine AS frontend
WORKDIR /frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npx ng build

# --- Stage 2: Spring Boot jar with the SPA bundled ---
FROM --platform=$BUILDPLATFORM eclipse-temurin:25-jdk AS backend
WORKDIR /backend
COPY backend/.mvn .mvn
COPY backend/mvnw backend/pom.xml ./
RUN --mount=type=cache,target=/root/.m2 ./mvnw -B -q dependency:resolve || true
COPY backend/src src
COPY --from=frontend /frontend/dist/frontend/browser/ src/main/resources/static/
RUN --mount=type=cache,target=/root/.m2 ./mvnw -B -DskipTests package \
 && cp target/ricettine-*.jar /app.jar

# --- Stage 3: runtime ---
FROM eclipse-temurin:25-jre
RUN useradd --system --uid 10001 --home-dir /app --create-home ricettine \
 && mkdir -p /data/media && chown -R ricettine:ricettine /data
COPY --from=backend /app.jar /app/app.jar
USER ricettine
WORKDIR /app
ENV RICETTINE_STORAGE_LOCAL_PATH=/data/media
# Size the heap from the container memory limit (default is only 25%) so it fits small hosts without OOM kills.
ENV JAVA_TOOL_OPTIONS="-XX:MaxRAMPercentage=75"
VOLUME /data
EXPOSE 8080
# The JRE image has no curl/wget; probe with bash's /dev/tcp instead.
HEALTHCHECK --interval=10s --timeout=5s --start-period=60s --retries=6 \
  CMD bash -c 'exec 3<>/dev/tcp/127.0.0.1/8080 && printf "GET /actuator/health HTTP/1.0\r\nHost: localhost\r\n\r\n" >&3 && grep -q "\"status\":\"UP\"" <&3' || exit 1
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
