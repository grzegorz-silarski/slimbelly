# Adding Recipes (`data/recipes/`)

Place your recipe JSON files in this `data/recipes/` folder and register them in `data/recipes/index.json`.

---

## Step 1: Register in `data/recipes/index.json`

Static web servers cannot list folder contents automatically, so `index.json` tells SlimBelly which recipe files to load:

```json
{
    "recipes": [
        "chicken-in-skyr.json"
    ]
}
```

---

## Step 2: Create a Recipe JSON File

Each recipe file in `data/recipes/` defines a meal (`id`, `name`, optional `tags`) and its `ingredients` array.

### Example (`data/recipes/chicken-in-skyr.json`)

```json
{
    "id": "chicken-in-skyr",
    "name": "Chicken in SKYR",
    "tags": ["lunch"],
    "ingredients": [
        {
            "id": "chicken-breast-strips",
            "name": "Chicken breast strips",
            "unit": "g",
            "amount": 400,
            "per": 100,
            "kcal": 115,
            "protein": 22.5,
            "carbs": 0,
            "fat": 2.6
        },
        {
            "id": "skyr-natural",
            "name": "SKYR natural",
            "unit": "ml",
            "amount": 150,
            "per": 100,
            "kcal": 63,
            "protein": 11,
            "carbs": 4,
            "fat": 0.2
        },
        {
            "id": "peanut-butter",
            "name": "Peanut butter",
            "unit": "spoon",
            "amount": 1,
            "per": 1,
            "kcal": 90,
            "protein": 3.8,
            "carbs": 3,
            "fat": 7.5
        },
        {
            "id": "honey",
            "name": "Honey",
            "unit": "spoon",
            "amount": 1,
            "per": 1,
            "kcal": 64,
            "protein": 0.1,
            "carbs": 17,
            "fat": 0
        }
    ]
}
```

---

## Field Reference

### Recipe Object

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | `string` | Yes | Unique identifier for the recipe (e.g. `"chicken-in-skyr"`). |
| `name` | `string` | Yes | Display name shown in the UI. |
| `tags` | `string[]` | No | Filter tags in the **Prepare a meal** modal (e.g. `["breakfast"]`, `["lunch", "dinner"]`). |
| `ingredients` | `object[]` | Yes | Non-empty list of ingredient definitions. |

### Ingredient Object

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | `string` | Yes | Unique identifier within the recipe (e.g. `"chicken-breast-strips"`). |
| `name` | `string` | Yes | Display name shown in the ingredient table. |
| `unit` | `string` | Yes | Measurement unit: `"g"`, `"ml"`, `"spoon"`, `"pcs"`, etc. |
| `amount` | `number` | Yes | Default recipe amount in `unit`. |
| `per` | `number` | Yes | Reference quantity for the nutrition values below (`100` for per 100g/100ml, `1` for per 1 piece/spoon). |
| `kcal` | `number` | Yes | Calories per `per` units of the ingredient. |
| `protein` | `number` | Yes | Protein (grams) per `per` units of the ingredient. |
| `carbs` | `number` | Yes | Carbohydrates (grams) per `per` units of the ingredient. |
| `fat` | `number` | Yes | Fat (grams) per `per` units of the ingredient. |
