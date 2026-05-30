import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

/**
 * Root application component — acts as the router host only.
 *
 * All layout and navigation live inside GalleryShellComponent, which is
 * rendered by the router for every protected route. This component simply
 * provides the top-level <router-outlet>.
 */
@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<router-outlet />`,
})
export class App {}
