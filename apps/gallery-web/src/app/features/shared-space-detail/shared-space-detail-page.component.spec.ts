import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { of, throwError } from 'rxjs';
import { StorageSpacesService } from '../../core/services/storage-spaces.service';
import { StorageSpaceDetail } from '../../core/models/storage-space-detail.model';
import { SharedSpaceDetailPageComponent } from './shared-space-detail-page.component';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const SPACE_ID = 'space-abc';

const MOCK_DETAIL: StorageSpaceDetail = {
  id: SPACE_ID,
  name: 'Team Photos',
  myRole: 'owner',
  owner: { id: 'owner-1', fullName: 'Alice Owner', email: 'alice@example.com' },
  members: [
    {
      spaceId: SPACE_ID,
      userId: 'member-1',
      role: 'editor',
      addedAt: '2024-01-01T00:00:00Z',
      user: { id: 'member-1', fullName: 'Bob Editor', email: 'bob@example.com' },
    },
  ],
  mediaCount: 7,
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('SharedSpaceDetailPageComponent', () => {
  let fixture: ComponentFixture<SharedSpaceDetailPageComponent>;
  let component: SharedSpaceDetailPageComponent;
  let spacesServiceMock: jest.Mocked<Pick<StorageSpacesService, 'getSpace'>>;

  beforeEach(async () => {
    spacesServiceMock = {
      getSpace: jest.fn().mockReturnValue(of(MOCK_DETAIL)),
    };

    await TestBed.configureTestingModule({
      imports: [SharedSpaceDetailPageComponent],
      providers: [
        { provide: StorageSpacesService, useValue: spacesServiceMock },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: { paramMap: convertToParamMap({ id: SPACE_ID }) },
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(SharedSpaceDetailPageComponent);
    component = fixture.componentInstance;
  });

  it('creates successfully', () => {
    expect(component).toBeTruthy();
  });

  it('reads the route param ID and calls getSpace on init', () => {
    fixture.detectChanges();
    expect(spacesServiceMock.getSpace).toHaveBeenCalledWith(SPACE_ID);
  });

  it('renders the space name from mocked data', () => {
    fixture.detectChanges();
    const compiled: HTMLElement = fixture.nativeElement;
    expect(compiled.textContent).toContain('Team Photos');
  });

  it('renders at least one member entry from mocked data', () => {
    fixture.detectChanges();
    const compiled: HTMLElement = fixture.nativeElement;
    expect(compiled.textContent).toContain('Bob Editor');
  });

  it('surfaces error403 state on a 403 response', () => {
    spacesServiceMock.getSpace.mockReturnValue(throwError(() => ({ status: 403 })));
    fixture.detectChanges();

    expect(component.error403).toBe(true);
    const compiled: HTMLElement = fixture.nativeElement;
    expect(compiled.textContent).toContain('Access denied');
  });

  it('surfaces error404 state on a 404 response', () => {
    spacesServiceMock.getSpace.mockReturnValue(throwError(() => ({ status: 404 })));
    fixture.detectChanges();

    expect(component.error404).toBe(true);
    const compiled: HTMLElement = fixture.nativeElement;
    expect(compiled.textContent).toContain('Not found');
  });

  it('surfaces generic loadError on an unexpected error', () => {
    spacesServiceMock.getSpace.mockReturnValue(throwError(() => ({ status: 500 })));
    fixture.detectChanges();

    expect(component.loadError).toBeTruthy();
    const compiled: HTMLElement = fixture.nativeElement;
    expect(compiled.textContent).toContain(component.loadError);
  });
});
