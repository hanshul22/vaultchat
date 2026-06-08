# VaultChat

VaultChat is a privacy-first chat and media platform where users store photos and videos in their own Cloudinary accounts instead of platform-owned storage. It combines real-time messaging, media uploads, albums, and shared storage in one system.

## Features

- Real-time 1:1 and group chat
- Photo and video uploads
- User-owned Cloudinary storage
- Albums and shared media spaces
- Google OAuth and JWT auth
- Large video support with browser-side processing

## Tech Stack

- Nx Monorepo
- NestJS backend
- Angular apps: `auth-web`, `chat-web`, `gallery-web`
- PostgreSQL
- Redis
- Socket.io
- Cloudinary
- `ffmpeg.wasm`

## How It Works

- Users sign up and connect a Cloudinary account
- Media is stored in the user's own Cloudinary account
- Videos are compressed and split in the browser using `ffmpeg.wasm`
- Chat and gallery features run on a single NestJS API

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

Build a privacy-first platform for chat and media sharing where users keep ownership of their files.