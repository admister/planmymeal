import { TestBed } from '@angular/core/testing';
import { App } from './app';

describe('App', () => {
  let app: App;

  const mockPlan = {
    breakfast: {
      item: 'Poha',
      steps: [
        { text: 'Wash flat rice', completed: false },
        { text: 'Roast peanuts and spices', completed: false }
      ],
      est_cost: 40
    },
    lunch: {
      item: 'Dal Chawal',
      steps: [
        { text: 'Boil basmati rice', completed: false },
        { text: 'Prepare yellow dal tadka', completed: false }
      ],
      est_cost: 60
    },
    dinner: {
      item: 'Khichdi',
      steps: [
        { text: 'Mix lentils, rice, and veggies', completed: false },
        { text: 'Pressure cook for 3 whistles', completed: false }
      ],
      est_cost: 50
    },
    grocery_list: [
      { item: 'Poha flat rice', completed: false },
      { item: 'Peanuts', completed: false },
      { item: 'Rice', completed: false },
      { item: 'Dal', completed: false }
    ],
    substitutions: [
      { original: 'Peanuts', alternative: 'Cashews' }
    ],
    budget_analysis: {
      is_feasible: true,
      total_estimated_cost: 150,
      note: 'Extremely budget-friendly Indian plan!'
    }
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
    }).compileComponents();

    const fixture = TestBed.createComponent(App);
    app = fixture.componentInstance;
  });

  it('should create the app', () => {
    expect(app).toBeTruthy();
  });

  describe('Form Initialization & Presets', () => {
    it('should initialize with correct default values', () => {
      expect(app.plannerForm.get('dietaryPreferences')?.value).toBe('Indian');
      expect(app.plannerForm.get('budget')?.value).toBe(400);
      expect(app.plannerForm.get('dayDescription')?.value).toBe('');
      expect(app.plannerForm.get('pantryItems')?.value).toBe('');
    });

    it('should validate form fields correctly', () => {
      const descControl = app.plannerForm.get('dayDescription');
      const budgetControl = app.plannerForm.get('budget');

      // Description is required
      descControl?.setValue('');
      expect(descControl?.valid).toBeFalse();

      // Description min length is 5
      descControl?.setValue('Busy');
      expect(descControl?.valid).toBeFalse();

      descControl?.setValue('Very busy back to back schedule');
      expect(descControl?.valid).toBeTrue();

      // Budget constraints (min 50, max 5000)
      budgetControl?.setValue(10);
      expect(budgetControl?.valid).toBeFalse();

      budgetControl?.setValue(6000);
      expect(budgetControl?.valid).toBeFalse();

      budgetControl?.setValue(500);
      expect(budgetControl?.valid).toBeTrue();
    });

    it('should patch the schedule description when a preset is selected', () => {
      app.selectPreset('busy');
      expect(app.plannerForm.get('dayDescription')?.value).toContain('busy');

      app.selectPreset('wfh');
      expect(app.plannerForm.get('dayDescription')?.value).toContain('work-from-home');

      app.selectPreset('gym');
      expect(app.plannerForm.get('dayDescription')?.value).toContain('protein');

      app.selectPreset('weekend');
      expect(app.plannerForm.get('dayDescription')?.value).toContain('weekend');
    });
  });

  describe('Custom Kitchen Tasks Checklist', () => {
    it('should support adding, toggling, and removing custom duties', () => {
      // Set input string and add
      app.customTaskInput.set('Clean the countertops');
      app.addCustomTask();

      expect(app.customTasks().length).toBe(1);
      expect(app.customTasks()[0]).toEqual({ text: 'Clean the countertops', completed: false });
      expect(app.customTaskInput()).toBe('');

      // Add another
      app.customTaskInput.set('Empty the garbage bin');
      app.addCustomTask();
      expect(app.customTasks().length).toBe(2);

      // Toggle first task completion state
      app.toggleCustomTask(0);
      expect(app.customTasks()[0].completed).toBeTrue();
      expect(app.customTasks()[1].completed).toBeFalse();

      // Toggle again
      app.toggleCustomTask(0);
      expect(app.customTasks()[0].completed).toBeFalse();

      // Remove task
      app.removeCustomTask(0);
      expect(app.customTasks().length).toBe(1);
      expect(app.customTasks()[0].text).toBe('Empty the garbage bin');
    });

    it('should not add custom duties if input is empty or pure whitespace', () => {
      app.customTaskInput.set('   ');
      app.addCustomTask();
      expect(app.customTasks().length).toBe(0);

      app.customTaskInput.set('');
      app.addCustomTask();
      expect(app.customTasks().length).toBe(0);
    });

    it('should update task input on keyup event', () => {
      const event = { target: { value: 'Prep raw spices' } } as unknown as KeyboardEvent;
      app.handleCustomTaskKeyup(event);
      expect(app.customTaskInput()).toBe('Prep raw spices');
    });
  });

  describe('Custom Grocery Checklist Items', () => {
    it('should support adding and toggling custom ingredients inside an active plan', () => {
      // Setup active plan
      app.plan.set(JSON.parse(JSON.stringify(mockPlan)));

      // Set input and add
      app.customGroceryInput.set('Fresh Coriander Leaves');
      app.addCustomGrocery();

      const list = app.plan()?.grocery_list || [];
      expect(list.length).toBe(5);
      expect(list[4]).toEqual({ item: 'Fresh Coriander Leaves', completed: false });
      expect(app.customGroceryInput()).toBe('');

      // Toggle check states
      app.toggleGrocery(4);
      expect(app.plan()?.grocery_list[4].completed).toBeTrue();
      expect(app.plan()?.grocery_list[0].completed).toBeFalse();

      app.toggleGrocery(4);
      expect(app.plan()?.grocery_list[4].completed).toBeFalse();
    });

    it('should update grocery input on keyup event', () => {
      const event = { target: { value: 'Mustard Seeds' } } as unknown as KeyboardEvent;
      app.handleCustomGroceryKeyup(event);
      expect(app.customGroceryInput()).toBe('Mustard Seeds');
    });
  });

  describe('Computed Progress Indicators', () => {
    it('should return default zero values when no plan is active', () => {
      app.plan.set(null);
      expect(app.totalTasks()).toBe(0);
      expect(app.completedTasks()).toBe(0);
      expect(app.progressPercentage()).toBe(0);
    });

    it('should calculate task progression accurately when plan is set', () => {
      app.plan.set(JSON.parse(JSON.stringify(mockPlan))); // 6 steps total across 3 meals

      expect(app.totalTasks()).toBe(6);
      expect(app.completedTasks()).toBe(0);
      expect(app.progressPercentage()).toBe(0);

      // Check a step in breakfast
      app.toggleStep('breakfast', 0);
      expect(app.completedTasks()).toBe(1);
      expect(app.progressPercentage()).toBe(17); // 1/6 = 16.66% -> 17%

      // Check a step in lunch
      app.toggleStep('lunch', 1);
      expect(app.completedTasks()).toBe(2);
      expect(app.progressPercentage()).toBe(33); // 2/6 = 33%

      // Add 2 custom tasks to the mix
      app.customTaskInput.set('Wash dishes');
      app.addCustomTask();
      app.customTaskInput.set('Defrost Paneer');
      app.addCustomTask();

      // Total tasks is now 6 meal steps + 2 custom tasks = 8 tasks
      expect(app.totalTasks()).toBe(8);
      expect(app.completedTasks()).toBe(2); // Still 2 completed
      expect(app.progressPercentage()).toBe(25); // 2/8 = 25%

      // Complete a custom task
      app.toggleCustomTask(0); // Completes 'Wash dishes'
      expect(app.completedTasks()).toBe(3);
      expect(app.progressPercentage()).toBe(38); // 3/8 = 37.5% -> 38%
    });
  });

  describe('Computed Grocery Checklist Stats', () => {
    it('should return zero percentages when no plan is active', () => {
      app.plan.set(null);
      expect(app.groceryStats()).toEqual({ total: 0, completed: 0, percentage: 0 });
    });

    it('should compute completion stats accurately as items are checked', () => {
      app.plan.set(JSON.parse(JSON.stringify(mockPlan))); // 4 items total

      expect(app.groceryStats()).toEqual({ total: 4, completed: 0, percentage: 0 });

      // Toggle first item
      app.toggleGrocery(0);
      expect(app.groceryStats()).toEqual({ total: 4, completed: 1, percentage: 25 });

      // Toggle second item
      app.toggleGrocery(1);
      expect(app.groceryStats()).toEqual({ total: 4, completed: 2, percentage: 50 });

      // Toggle all items
      app.toggleGrocery(2);
      app.toggleGrocery(3);
      expect(app.groceryStats()).toEqual({ total: 4, completed: 4, percentage: 100 });
    });
  });

  describe('Computed Budget Strategist Comparisons', () => {
    it('should calculate budget difference and flags correctly when plan is active', () => {
      app.plannerForm.patchValue({ budget: 400 });
      app.plan.set(JSON.parse(JSON.stringify(mockPlan))); // estimated total cost 150 INR

      const stats = app.budgetComparison();
      expect(stats.limit).toBe(400);
      expect(stats.actual).toBe(150);
      expect(stats.difference).toBe(250);
      expect(stats.absDifference).toBe(250);
      expect(stats.percentage).toBe(38); // 150/400 = 37.5% -> 38%
      expect(stats.isExceeded).toBeFalse();
    });

    it('should detect when budget is exceeded and handle calculations correctly', () => {
      app.plannerForm.patchValue({ budget: 100 });
      app.plan.set(JSON.parse(JSON.stringify(mockPlan))); // estimated total cost 150 INR

      const stats = app.budgetComparison();
      expect(stats.limit).toBe(100);
      expect(stats.actual).toBe(150);
      expect(stats.difference).toBe(-50);
      expect(stats.absDifference).toBe(50);
      expect(stats.percentage).toBe(150);
      expect(stats.isExceeded).toBeTrue();
    });
  });

  describe('Reset & Plan Day New State Resetting', () => {
    it('should clear active plan, custom tasks, and reset form inputs back to defaults', () => {
      app.plannerForm.patchValue({
        dayDescription: 'A custom day profile description',
        budget: 650,
        dietaryPreferences: 'Vegan',
        pantryItems: 'Lentils'
      });
      app.plan.set(JSON.parse(JSON.stringify(mockPlan)));
      app.customTasks.set([{ text: 'Clean oven', completed: true }]);

      app.resetPlan();

      expect(app.plan()).toBeNull();
      expect(app.customTasks().length).toBe(0);
      expect(app.plannerForm.get('dayDescription')?.value).toBe('');
      expect(app.plannerForm.get('budget')?.value).toBe(400);
      expect(app.plannerForm.get('dietaryPreferences')?.value).toBe('Indian');
      expect(app.plannerForm.get('pantryItems')?.value).toBe('');
    });
  });
});

