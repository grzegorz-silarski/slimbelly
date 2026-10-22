# Adding Recipes (`data/recipes/`)

Place your recipe JSON files in this `data/recipes/` folder and register them in `data/recipes/index.json`.

---

## Step 1: Create `data/recipes/index.json`

Static web servers cannot list folder contents automatically, so `index.json` tells SlimBelly which recipe files to load:

```json
{
    "recipes": [
        "oatmeal-whey.json",
        "chicken-rice-bowl.json"
    ]
}
```

---

## Step 2: Create a Recipe JSON File

Each recipe file in `data/recipes/` defines a meal (`id`, `name`, optional `tags`) and its `ingredients` array.

### Example (`data/recipes/chicken-rice-bowl.json`)

```json
{
    "id": "chicken-rice-bowl",
    "name": "Chicken & Rice Bowl",
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
            "fat": 2.6,
            "adjust": { "min": 80, "max": 300, "step": 10 }
        },
        {
            "id": "rice",
            "name": "White rice (dry)",
            "unit": "g",
            "amount": 70,
            "per": 100,
            "kcal": 360,
            "protein": 7,
            "carbs": 79,
            "fat": 0.6,
            "adjust": { "min": 30, "max": 180, "step": 5 }
        },
        {
            "id": "egg",
            "name": "Egg (L)",
            "unit": "pcs",
            "amount": 1,
            "per": 1,
            "kcal": 72,
            "protein": 6.3,
            "carbs": 0.4,
            "fat": 4.8,
            "adjust": { "min": 0, "max": 3, "step": 1 }
        },
        {
            "id": "olive-oil",
            "name": "Olive oil",
            "unit": "ml",
            "amount": 10,
            "per": 100,
            "kcal": 820,
            "protein": 0,
            "carbs": 0,
            "fat": 91,
            "adjust": { "min": 0, "max": 25, "step": 5 }
        },
        {
            "id": "spices",
            "name": "Spices",
            "unit": "g",
            "amount": 2,
            "per": 100,
            "kcal": 0,
            "protein": 0,
            "carbs": 0,
            "fat": 0,
            "adjust": false
        }
    ]
}
```

---

## Field Reference

### Recipe Object

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | `string` | Yes | Unique identifier for the recipe (e.g. `"chicken-rice-bowl"`). |
| `name` | `string` | Yes | Display name shown in the UI. |
| `tags` | `string[]` | No | Filter tags in the **Prepare a meal** modal (e.g. `["breakfast"]`, `["lunch", "dinner"]`). |
| `ingredients` | `object[]` | Yes | Non-empty list of ingredient definitions. |

### Ingredient Object

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | `string` | Yes | Unique identifier within the recipe (e.g. `"rice"`). |
| `name` | `string` | Yes | Display name shown in the ingredient table. |
| `unit` | `string` | Yes | Measurement unit: `"g"`, `"ml"`, `"pcs"`, etc. |
| `amount` | `number` | Yes | Default recipe amount in `unit` (must be within `adjust.min..adjust.max`). |
| `per` | `number` | Yes | Reference quantity for the nutrition values below (`100` for per 100g/100ml, `1` for per 1 piece). |
| `kcal` | `number` | Yes | Calories per `per` units of the ingredient. |
| `protein` | `number` | Yes | Protein (grams) per `per` units of the ingredient. |
| `carbs` | `number` | Yes | Carbohydrates (grams) per `per` units of the ingredient. |
| `fat` | `number` | Yes | Fat (grams) per `per` units of the ingredient. |
| `adjust` | `object \| false` | No | `{ "min": number, "max": number, "step": number }` bounds for automatic scaling, or `false` to keep the ingredient fixed at `amount`. |

---

## Sample Recipes for Reference

Sample recipes used by the test suite can be found in [`tests/data/recipes/`](../../tests/data/recipes/).

