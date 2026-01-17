import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SetupWizardComponent } from './setup-wizard.component';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';

describe('SetupWizardComponent', () => {
  let component: SetupWizardComponent;
  let fixture: ComponentFixture<SetupWizardComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SetupWizardComponent],
      providers: [
        provideRouter([]),
        provideHttpClient(),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(SetupWizardComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should start at the first step', () => {
    expect(component.currentStep).toBe(0);
  });

  it('should have two total steps', () => {
    expect(component.totalSteps).toBe(2);
  });
});
