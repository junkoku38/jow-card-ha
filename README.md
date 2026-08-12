# jow-card-ha

Carte Lovelace **Home Assistant** pour afficher le menu de la semaine à partir de l'intégration [ha-jow](https://github.com/junkoku38/ha-jow) (ou n'importe quelles entités fournissant un plat par jour).

## Installation

1. Copier `weekly-menu-card.js` dans `/config/www/` (ou le dossier servi par HA).
2. Ajouter la ressource dans le dashboard :
   ```yaml
   resources:
     - url: /local/weekly-menu-card.js
       type: module
   ```
3. Carte disponible sous le type `custom:weekly-menu-card`.

## Configuration

```yaml
type: custom:weekly-menu-card
entities:
  - sensor.jow_lundi
  - sensor.jow_mardi
  - sensor.jow_mercredi
  - sensor.jow_jeudi
  - sensor.jow_vendredi
  - sensor.jow_samedi
  - sensor.jow_dimanche
days: 7            # 7 = semaine entière, 1 = un seul plat avec flèches
show_calories: true
show_allergens: true
replace_action:
  service: jow.plan_meal
  data:
    query: poulet léger
    date: "{date}"
    choice: 1
```

La carte reste compatible avec n'importe quelle intégration : la correspondance d'attributs est configurable via `attributes`.