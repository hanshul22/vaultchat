import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-gallery-shell',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <div class="shell">
      <nav class="shell-nav" aria-label="Main navigation">
        <span class="shell-brand">Vault</span>
        <a routerLink="/gallery" routerLinkActive="active" class="nav-link">Gallery</a>
        <a routerLink="/albums" routerLinkActive="active" class="nav-link">Albums</a>
        <a routerLink="/uploads" routerLinkActive="active" class="nav-link">Uploads</a>
        <a routerLink="/shared-spaces" routerLinkActive="active" class="nav-link">Shared Spaces</a>
      </nav>
      <main class="shell-content">
        <router-outlet />
      </main>
    </div>
  `,
  styles: [
    `
      .shell {
        display: flex;
        flex-direction: column;
        min-height: 100vh;
      }
      .shell-nav {
        display: flex;
        align-items: center;
        gap: 1.5rem;
        padding: 0.75rem 1.5rem;
        background: #1a1a2e;
        color: #fff;
      }
      .shell-brand {
        font-weight: 700;
        font-size: 1.1rem;
        margin-right: 1rem;
        letter-spacing: 0.05em;
      }
      .nav-link {
        color: #ccc;
        text-decoration: none;
        font-size: 0.95rem;
        padding: 0.25rem 0.5rem;
        border-radius: 4px;
        transition: color 0.15s;
      }
      .nav-link:hover {
        color: #fff;
      }
      .nav-link.active {
        color: #fff;
        background: rgba(255, 255, 255, 0.12);
      }
      .shell-content {
        flex: 1;
        padding: 1.5rem;
      }
    `,
  ],
})
export class GalleryShellComponent {}
