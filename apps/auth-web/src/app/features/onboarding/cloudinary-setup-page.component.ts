import { ChangeDetectionStrategy, Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { AuthShellComponent } from '../../shared/auth-shell/auth-shell.component';

@Component({
  selector: 'app-cloudinary-setup-page',
  standalone: true,
  imports: [CommonModule, RouterLink, MatButtonModule, AuthShellComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './cloudinary-setup-page.component.html',
  styleUrl: './cloudinary-setup-page.component.scss',
})
export class CloudinarySetupPageComponent {}
