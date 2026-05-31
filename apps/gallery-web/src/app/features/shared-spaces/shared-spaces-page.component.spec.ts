import { provideLocationMocks } from '@angular/common/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { StorageSpacesService } from '../../core/services/storage-spaces.service';
import { StorageSpace } from '../../core/models/storage-space.model';
import { SharedSpacesPageComponent } from './shared-spaces-page.component';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const MOCK_SPACES: StorageSpace[] = [
  {
    id: 'space-1',
    name: 'Design Assets',
    isOwner: true,
    myRole: 'owner',
    memberCount: 2,
    mediaCount: 10,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  },
  {
    id: 'space-2',
    name: 'Marketing Shots',
    isOwner: false,
    myRole: 'editor',
    memberCount: 1,
    mediaCount: 5,
    createdAt: '2024-01-02T00:00:00Z',
    updatedAt: '2024-01-02T00:00:00Z',
  },
];

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('SharedSpacesPageComponent', () => {
  let fixture: ComponentFixture<SharedSpacesPageComponent>;
  let component: SharedSpacesPageComponent;
  let spacesServiceMock: jest.Mocked<Pick<StorageSpacesService, 'listSpaces' | 'createSpace'>>;

  beforeEach(async () => {
    spacesServiceMock = {
      listSpaces: jest.fn().mockReturnValue(of(MOCK_SPACES)),
      createSpace: jest.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [SharedSpacesPageComponent],
      providers: [
        { provide: StorageSpacesService, useValue: spacesServiceMock },
        provideRouter([]),
        provideLocationMocks(),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(SharedSpacesPageComponent);
    component = fixture.componentInstance;
  });

  it('creates successfully', () => {
    expect(component).toBeTruthy();
  });

  it('calls listSpaces on init', () => {
    fixture.detectChanges();
    expect(spacesServiceMock.listSpaces).toHaveBeenCalledTimes(1);
  });

  it('renders at least one space name from mocked data', () => {
    fixture.detectChanges();
    const compiled: HTMLElement = fixture.nativeElement;
    expect(compiled.textContent).toContain('Design Assets');
  });

  it('renders the Open link with /shared-spaces/:id for a mocked space', () => {
    fixture.detectChanges();
    const compiled: HTMLElement = fixture.nativeElement;
    const links = compiled.querySelectorAll<HTMLAnchorElement>('a');
    const openLink = Array.from(links).find((a) => a.textContent?.trim() === 'Open');
    expect(openLink).toBeTruthy();
    expect(openLink?.getAttribute('href')).toContain('/shared-spaces/space-1');
  });

  it('surfaces loadError when the service errors', () => {
    spacesServiceMock.listSpaces.mockReturnValue(throwError(() => new Error('network')));
    fixture.detectChanges();

    expect(component.loadError).toBeTruthy();
    const compiled: HTMLElement = fixture.nativeElement;
    expect(compiled.textContent).toContain(component.loadError);
  });
});
