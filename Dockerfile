# https://stackoverflow.com/a/58487433
# To prevent cache invalidation from changes in fields other than dependencies
FROM endeveit/docker-jq AS deps
COPY package.json /tmp
RUN jq '{ dependencies, devDependencies }' < /tmp/package.json > /tmp/deps.json

FROM node:16.14.0-alpine3.14
RUN apk add --no-cache imagemagick ffmpeg chromium
WORKDIR /app
COPY --from=deps /tmp/deps.json ./package.json
COPY package-lock.json .
RUN npm ci --ignore-scripts --no-optional

# The "--ignore-scripts --no-optional" is necessary to block puppeteer
# chromium binary downloading, but this broke staticmap
# and discordjs/voice packages. To fix it, these two
# "sharp" and "opusscript" installation are necessary.
RUN npm --no-save i sharp opusscript

COPY package.json .
COPY tsconfig.json .
COPY assets/ assets/
COPY src/ src/
RUN npm run build
ENTRYPOINT ["node", "dist/app"]
