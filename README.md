# VaultChat

VaultChat is a privacy-focused chat and media platform that lets users keep their photos and videos in their own Cloudinary accounts. It brings together messaging, media uploads, albums, and shared storage in a single app.

## Features

- Real-time personal and group chat
- Photo and video uploads
- User-managed Cloudinary storage
- Albums and shared spaces
- Google OAuth and JWT-based authentication
- Large video uploads with browser-side processing

## Tech Stack

- Nx Monorepo
- NestJS
- Angular (`auth-web`, `chat-web`, `gallery-web`)
- PostgreSQL
- Redis
- Socket.io
- Cloudinary
- `ffmpeg.wasm`

## How It Works

- Users create an account and connect Cloudinary
- Media is stored in the user’s own Cloudinary account
- Videos are processed in the browser before upload
- A single NestJS backend powers chat, auth, and gallery features

## Project Structure

```text
apps/
  api/
  auth-web/
  chat-web/
  gallery-web/

libs/
  shared/
  auth/
  users/
  chat/
  media/
  albums/
  storage/
  websocket/
  cloudinary/
  infra/
```

## Goal

Create a private and scalable platform for messaging and media sharing while keeping file ownership with the user.