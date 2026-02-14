# Tabla de elementos SKU

Formato: **[Tipo][Elemento][Número][Código]** = 10 caracteres
- Tipo: I=Ingredient, D=Dish, S=Supplier
- Elemento: 2 letras (subcategoría)
- Número: 0010, 0020, 0030... (incrementos de 10; 0011-0019 reservados para colisiones)
- Código: 3 letras (identificador del ítem)

## Ingredientes (I)

| Elemento | Significado | Ejemplos |
|----------|-------------|----------|
| LV | Lacteos | Burrata, Yogur, Queso feta |
| GR | Cereales | Pan, Arroz, Granola |
| CO | Condimentos | Pesto, Curry, Salsas |
| VG | Vegetales | Tomates, Rúcula, Crudités |
| FR | Frutas | Aguacate, Mango, Fresas |
| PR | Proteinas | Tofu, Huevo, Pollo, Salmón |
| OT | Otros | Frutos secos, Miel, Leche almendra |
| BE | Bebidas | Refrescos, Zumos, Vinos |
| CF | Cafe | Café solo, con leche |

## Platos (D)

| Elemento | Significado | Ejemplos |
|----------|-------------|----------|
| DK | Drink | Bebidas del menú |
| CL | Cold | Tostada, Ceviche, Bowls fríos |
| HT | Hot | Curry, Benedict, Tacos |
| DS | Dessert | Air Pancake, Puding |
| SL | Salad | Bowl de la Huerta |

## Proveedores (S)

| Elemento | Significado | Ejemplos |
|----------|-------------|----------|
| AL | All/General | Suministros varios |
| DK | Drinks | Bebidas y cafés |
| SL | Salads/Fresh | Productos frescos |
