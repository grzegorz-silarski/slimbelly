# SlimBelly – Diet Planner

A static, zero-backend web app (HTML + CSS + vanilla JS ES modules, styled with Tailwind CSS v4 and daisyUI v5 `fantasy` theme) that composes today's meals from JSON recipes and automatically scales ingredient amounts to hit your daily calorie and macro targets.

## Running Locally

Because recipes and configuration are loaded via `fetch()`, the app must be served over HTTP (`file://` URLs block `fetch`).

```bash
npm run serve
```

Or directly with `npx`:

```bash
npx serve -l 8000 .
```

Then open http://localhost:8000 in your browser.

## Running Tests

Core calculation, validation, and state modules have zero DOM dependencies and run directly with Node's built-in test runner:

```bash
npm test
# or: node --test "tests/*.test.js"
```

## Configuration (`data/config.json`)

Edit `data/config.json` to set your daily calorie and macro goals. Both `"grams"` and `"percentage"` modes are supported, while the daily view always displays calculated targets and meal macros in **grams (`g`)**.

### Option 1: Grams mode (`"macroMode": "grams"`)

```json
{
  "targets": {
    "kcal": 2600,
    "protein": 180,
    "carbs": 300,
    "fat": 75
  },
  "macroMode": "grams",
  "plannedMealsPerDay": 4,
  "tolerance": { "kcal": 3, "protein": 5, "carbs": 5, "fat": 5 },
  "solver": {
    "mode": "optimize",
    "weights": { "kcal": 1.0, "protein": 2.0, "carbs": 1.0, "fat": 1.0 },
    "ratioPreservation": 0.3
  }
}
```

### Option 2: Percentage mode (`"macroMode": "percentage"`)

Macros are specified as a percentage of daily `kcal` (or as `"30%"` strings) and converted to grams automatically using `kcalPerGram` (defaults to `4` for protein, `4` for carbs, and `9` for fat):

```json
{
  "targets": {
    "kcal": 2600,
    "protein": 30,
    "carbs": 45,
    "fat": 25
  },
  "macroMode": "percentage",
  "kcalPerGram": {
    "protein": 4,
    "carbs": 4,
    "fat": 9
  },
  "plannedMealsPerDay": 4
}
```

You can also switch between **Grams (`g`)** and **Percentage (`%`)** directly in the app via the **Target** button on the Daily target card.
- **`plannedMealsPerDay`**: Expected number of meals per day so early meals take a proportional share of the budget and the final planned meal closes the remaining daily target.
- **`solver.mode`**:
  - `"optimize"` — bounded weighted least squares across adjustable ingredients to hit both calories and macros while staying close to recipe proportions (`ratioPreservation`).
  - `"scale"` — uniform scaling factor across adjustable ingredients to hit calories while keeping exact recipe ratios.

## Adding Recipes (`data/recipes/`)

1. Create a new JSON file in `data/recipes/` (e.g. `data/recipes/my-meal.json`):
   ```json
   {
     "id": "my-meal",
     "name": "My Custom Meal",
     "tags": ["lunch", "dinner"],
     "ingredients": [
       {
         "id": "chicken-breast",
         "name": "Chicken breast (raw)",
         "unit": "g",
         "amount": 150,
         "per": 100,
         "kcal": 120,
         "protein": 22.5,
         "carbs": 0,
         "fat": 2.6
       }
     ]
   }
   ```
   - `per`: The reference amount (`100` for per-100g/ml values, `1` for per-piece/spoon items).
2. Register the filename in `data/recipes/index.json`.

## Features

- **Sequential calculation**: Meals are calculated in order. Each meal targets a share of the remaining daily calories/macros.
- **Drag & drop + settings reorder**: Reorder meals via the drag handle (`⋮⋮`) on desktop and mobile touch, or via the meal settings modal. All subsequent meals recalculate automatically.
- **Day-only overrides**: Edit any ingredient amount directly in the day view to override it for today (stored in `localStorage` under `slimbelly:day:YYYY-MM-DD`). Original recipe JSON files are never modified, and all subsequent meals recalculate to fit the daily goal.
- **Meal locking & share weights**: Freeze a meal's amounts or adjust its relative portion weight (`×0.5`, `×1`, `×2`, etc.) from the meal settings dialog.
