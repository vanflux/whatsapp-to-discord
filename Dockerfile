FROM node:16.14.0-alpine3.14
RUN apk add --no-cache imagemagick ffmpeg chromium
WORKDIR app
COPY package.json .
COPY package-lock.json .
RUN npm ci --ignore-scripts --no-optional

# The "--ignore-scripts --no-optional" is necessary to block puppeteer
# chromium binary downloading, but this broke staticmap
# and discordjs/voice packages. To fix it, these two
# "sharp" and "opusscript" installation are necessary.
RUN npm --no-save i sharp opusscript

COPY . .
RUN npm run build
ENTRYPOINT ["node", "dist/app"]
