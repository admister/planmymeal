import { ChangeDetectionStrategy, Component, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';

interface MealStep {
  text: string;
  completed: boolean;
}

interface InteractiveMeal {
  item: string;
  steps: MealStep[];
  est_cost: number;
}

interface InteractivePlan {
  breakfast: InteractiveMeal;
  lunch: InteractiveMeal;
  dinner: InteractiveMeal;
  grocery_list: { item: string; completed: boolean }[];
  substitutions: { original: string; alternative: string }[];
  budget_analysis: {
    is_feasible: boolean;
    total_estimated_cost: number;
    note: string;
  };
}

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-root',
  imports: [CommonModule, ReactiveFormsModule, MatIconModule],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  private fb = inject(FormBuilder);

  // Form setup using Angular Reactive Forms (Strict Guidelines Compliance)
  plannerForm: FormGroup = this.fb.group({
    dayDescription: ['', [Validators.required, Validators.minLength(5), Validators.maxLength(500)]],
    budget: [400, [Validators.required, Validators.min(50), Validators.max(5000)]],
    dietaryPreferences: ['Indian'],
    pantryItems: ['']
  });

  // Signals for state management
  isGenerating = signal<boolean>(false);
  error = signal<string | null>(null);
  plan = signal<InteractivePlan | null>(null);
  
  // Custom checklist items
  customTasks = signal<{ text: string; completed: boolean }[]>([]);
  showCopiedToast = signal<boolean>(false);
  
  // Active custom item input values
  customTaskInput = signal<string>('');
  customGroceryInput = signal<string>('');

  // Loading Tips ticker
  loadingTipIndex = signal<number>(0);
  loadingTips = [
    "Did you know? Storing onions and potatoes together makes them spoil faster due to released moisture and gases.",
    "Budget hack: Dried beans and lentils cost up to 3x less than canned versions and keep much longer.",
    "Prep tip: Chop your garlic, onions, and veggies in one batch at the start of your cooking block to save time.",
    "Zero waste: Collect veggie scraps (carrot peels, onion skins, celery ends) in the freezer to make rich homemade broth.",
    "Culinary secret: Letting meat or tofu rest for a few minutes post-cooking keeps it tender, juicy, and flavorful.",
    "Savings tip: Buy store-brand staples (rice, flour, spices)—they usually have identical quality for 30% less cost."
  ];

  // Selected meal view (for displaying detailed tabs/cards)
  activeMealTab = signal<'breakfast' | 'lunch' | 'dinner'>('breakfast');

  // Computed signals for real-time progress calculations
  totalTasks = computed(() => {
    const current = this.plan();
    if (!current) return 0;
    const mealStepsCount = 
      current.breakfast.steps.length + 
      current.lunch.steps.length + 
      current.dinner.steps.length;
    return mealStepsCount + this.customTasks().length;
  });

  completedTasks = computed(() => {
    const current = this.plan();
    if (!current) return 0;
    const mealCompleted = 
      current.breakfast.steps.filter(s => s.completed).length +
      current.lunch.steps.filter(s => s.completed).length +
      current.dinner.steps.filter(s => s.completed).length;
    const customCompleted = this.customTasks().filter(t => t.completed).length;
    return mealCompleted + customCompleted;
  });

  progressPercentage = computed(() => {
    const total = this.totalTasks();
    if (total === 0) return 0;
    return Math.round((this.completedTasks() / total) * 100);
  });

  // Computed signals for grocery checklist progress
  groceryStats = computed(() => {
    const current = this.plan();
    if (!current) return { total: 0, completed: 0, percentage: 0 };
    const total = current.grocery_list.length;
    const completed = current.grocery_list.filter(g => g.completed).length;
    const percentage = total === 0 ? 0 : Math.round((completed / total) * 100);
    return { total, completed, percentage };
  });

  // Computed signals for budget strategist dashboard
  budgetComparison = computed(() => {
    const current = this.plan();
    const limit = this.plannerForm.get('budget')?.value || 0;
    if (!current) return { limit, actual: 0, difference: 0, percentage: 0, isExceeded: false, absDifference: 0 };
    const actual = current.budget_analysis.total_estimated_cost;
    const difference = limit - actual;
    const percentage = limit === 0 ? 0 : Math.round((actual / limit) * 100);
    const isExceeded = actual > limit;
    return { limit, actual, difference, percentage, isExceeded, absDifference: Math.abs(difference) };
  });

  // Fill in popular presets for user day schedule
  selectPreset(presetType: string) {
    let desc = '';
    switch (presetType) {
      case 'busy':
        desc = 'Extremely busy back-to-back schedule. Need very fast, hands-off prep and easy-to-follow meals.';
        break;
      case 'wfh':
        desc = 'Cozy work-from-home schedule. I can take brief 10-15 minute kitchen breaks to prep or let things simmer.';
        break;
      case 'gym':
        desc = 'Gym day with heavy evening training. Looking for high-protein meals with simple, clean energy ingredients.';
        break;
      case 'weekend':
        desc = 'Slow, lazy weekend schedule. Happy to spend a little more time experimenting with healthy cooking.';
        break;
    }
    this.plannerForm.patchValue({ dayDescription: desc });
  }

  // Generate cooking plan via server-side API proxy
  async generatePlan() {
    if (this.plannerForm.invalid) {
      this.plannerForm.markAllAsTouched();
      return;
    }

    this.isGenerating.set(true);
    this.error.set(null);
    this.plan.set(null);
    this.customTasks.set([]);

    // Periodically update loading tips
    const intervalId = setInterval(() => {
      this.loadingTipIndex.update(idx => (idx + 1) % this.loadingTips.length);
    }, 4000);

    try {
      const formValue = this.plannerForm.value;
      const response = await fetch('/api/generate-plan', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          dayDescription: formValue.dayDescription,
          budget: formValue.budget,
          dietaryPreferences: formValue.dietaryPreferences,
          pantryItems: formValue.pantryItems,
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `Server returned status code ${response.status}`);
      }

      const data = await response.json();
      
      // Map received plans with completed toggle flags
      this.plan.set({
        breakfast: {
          item: data.meal_plan.breakfast.item,
          steps: data.meal_plan.breakfast.steps.map((s: string) => ({ text: s, completed: false })),
          est_cost: Number(data.meal_plan.breakfast.est_cost || 0)
        },
        lunch: {
          item: data.meal_plan.lunch.item,
          steps: data.meal_plan.lunch.steps.map((s: string) => ({ text: s, completed: false })),
          est_cost: Number(data.meal_plan.lunch.est_cost || 0)
        },
        dinner: {
          item: data.meal_plan.dinner.item,
          steps: data.meal_plan.dinner.steps.map((s: string) => ({ text: s, completed: false })),
          est_cost: Number(data.meal_plan.dinner.est_cost || 0)
        },
        grocery_list: (data.grocery_list || []).map((g: string) => ({ item: g, completed: false })),
        substitutions: data.substitutions || [],
        budget_analysis: {
          is_feasible: !!data.budget_analysis.is_feasible,
          total_estimated_cost: Number(data.budget_analysis.total_estimated_cost || 0),
          note: data.budget_analysis.note || ''
        }
      });
      
      // Default to breakfast detail view
      this.activeMealTab.set('breakfast');

    } catch (err: unknown) {
      console.error(err);
      const message = err instanceof Error ? err.message : 'An unexpected error occurred. Please check your network connection and API key configuration.';
      this.error.set(message);
    } finally {
      clearInterval(intervalId);
      this.isGenerating.set(false);
    }
  }

  // Toggle meal step check states
  toggleStep(mealType: 'breakfast' | 'lunch' | 'dinner', index: number) {
    this.plan.update(current => {
      if (!current) return null;
      const meal = current[mealType];
      const steps = [...meal.steps];
      steps[index] = { ...steps[index], completed: !steps[index].completed };
      return {
        ...current,
        [mealType]: { ...meal, steps }
      };
    });
  }

  // Toggle grocery item check states
  toggleGrocery(index: number) {
    this.plan.update(current => {
      if (!current) return null;
      const list = [...current.grocery_list];
      list[index] = { ...list[index], completed: !list[index].completed };
      return { ...current, grocery_list: list };
    });
  }

  // Add custom ingredient/grocery items
  handleCustomGroceryKeyup(event: KeyboardEvent) {
    const input = (event.target as HTMLInputElement).value;
    this.customGroceryInput.set(input);
  }

  addCustomGrocery() {
    const text = this.customGroceryInput().trim();
    if (!text) return;
    this.plan.update(current => {
      if (!current) return null;
      return {
        ...current,
        grocery_list: [...current.grocery_list, { item: text, completed: false }]
      };
    });
    this.customGroceryInput.set('');
  }

  // Manage general custom cooking/cleanup tasks
  handleCustomTaskKeyup(event: KeyboardEvent) {
    const input = (event.target as HTMLInputElement).value;
    this.customTaskInput.set(input);
  }

  addCustomTask() {
    const text = this.customTaskInput().trim();
    if (!text) return;
    this.customTasks.update(tasks => [...tasks, { text, completed: false }]);
    this.customTaskInput.set('');
  }

  toggleCustomTask(index: number) {
    this.customTasks.update(tasks => {
      const copy = [...tasks];
      copy[index] = { ...copy[index], completed: !copy[index].completed };
      return copy;
    });
  }

  removeCustomTask(index: number) {
    this.customTasks.update(tasks => tasks.filter((_, i) => i !== index));
  }

  // Print & Clipboard utility functions
  copyGroceryList() {
    const current = this.plan();
    if (!current) return;
    const listItems = current.grocery_list
      .map(g => `${g.completed ? '[x]' : '[ ]'} ${g.item}`)
      .join('\n');
    
    const clipboardText = `🛒 AI Meal Planner Grocery To-Do List:\n\n${listItems}\n\nGenerated via AI Cooking Planner`;
    navigator.clipboard.writeText(clipboardText).then(() => {
      this.showCopiedToast.set(true);
      setTimeout(() => this.showCopiedToast.set(false), 2000);
    });
  }

  printPlan() {
    window.print();
  }

  resetPlan() {
    this.plan.set(null);
    this.customTasks.set([]);
    this.plannerForm.reset({
      dayDescription: '',
      budget: 400,
      dietaryPreferences: 'Indian',
      pantryItems: ''
    });
  }
}
