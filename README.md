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
title: Menu de la semaine     # en-tête facultatif
entities:                      # 7 entités, de lundi à dimanche
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
show_week_calories: false   # total kcal de la semaine en pied de carte
show_month: false           # vue mensuelle compacte (semaines existantes)
replace_action:
  service: jow.suggest
  data:
    criteria: poulet léger     # enrichi automatiquement du thème du jour et du frigo
    weekday: "{weekday}"       # jeton interpolé par la carte
    covers: 2
    limit: 5
```

La carte reste compatible avec n'importe quelle intégration : la correspondance d'attributs est configurable via `attributes`.

## Toutes les options

| Option | Type | Défaut | Description |
|---|---|---|---|
| `title` | string | — | Titre affiché en en-tête de carte |
| `prefix` | string | `sensor.jow_` | Préfixe des entités si `entities` n'est pas fourni |
| `entry_name` | string | — | Instance Jow à cibler (param `entry_name` des services `jow.*`) — utile en multi-instance |
| `entities` | list (7) | `sensor.jow_*` | Entités des 7 jours, de lundi à dimanche |
| `entities_s1` | map | auto `_s1` | Entités de la semaine prochaine (suffixe `_s1` si absent) |
| `days` | `7` \| `1` | `7` | Semaine entière (détail + index) ou un seul plat avec flèches |
| `show_calories` | bool | `true` | Calories par portion (et total) dans le détail |
| `show_allergens` | bool | `true` | Allergènes (codes INCO 1-14) dans le détail, l'index et le pied |
| `show_week_calories` | bool | `false` | Total et moyenne kcal/semaine en pied de carte |
| `show_month` | bool | `false` | Vue mensuelle : les semaines dont les entités existent (S, S+1, et S-1/S+2 si présentes) |
| `replace_action` | map | — | Action de remplacement : `{ service: "domaine.svc", data: {...} }` avec jetons `{date}`, `{weekday}`, `{index}` |
| `replace_ai_prompt` | string | — | Prompt IA personnalisé (envoyé comme `ai_prompt`) |
| `day_themes` | map | `{}` | Thème par jour injecté dans le criteria (ex : `{ "lundi": "végétarien" }`) |
| `criteria_presets` | list | `[]` | Presets appliqués au **choix automatique** et au bouton « Changer de recette » des jours listés — jamais à la barre « Proposer un plat » (prompt libre = précision). Ex : `{ name: Léger, criteria: "plat léger équilibré", max_calories: 600, days: [lundi, mercredi, vendredi] }`. Éditable visuellement (3 presets dans l'éditeur ; plus via YAML). `max_calories` : contrainte vérifiée en dur sur le plat planifié. `max_total_time` : filtre dur avant la sélection (prép. + cuisson). Nécessite l'intégration jow-meals ≥ 0.9.8. |
| `fridge_ingredients` | string | — | Ingrédients disponibles (ex : `"poulet, courgettes"`) injectés dans le criteria |
| `plan_next_enabled` | bool | `true` | Bouton « Planifier la semaine prochaine » (7 appels à `replace_action` avec `week_offset: 1`) |
| `actions.meal_done` | bool | `true` | Bouton « Marquer comme fait » (`jow.meal_done`) |
| `actions.clear_meal` | bool | `true` | Bouton « Effacer ce jour » (`jow.clear_meal`) |
| `actions.meal_done_service` | string | `jow.meal_done` | Surcharge du service appelé par « Marquer comme fait » (ex. `script.manger`) |
| `actions.clear_meal_service` | string | `jow.clear_meal` | Surcharge du service appelé par « Effacer ce jour » |
| `actions.refresh_shopping` | bool | `false` | Bouton « Régénérer la liste de courses » (`jow.refresh_shopping_list`) |
| `actions.send_jow` | bool | `false` | Bouton « Envoyer à Jow » (ouvre les recettes sur jow.fr) |
| `actions.copy_meal` | bool | `false` | Bouton « Copier vers… » (`jow.copy_meal`) |
| `actions.favoris` | bool | `false` | Bouton « Choisir parmi mes favoris » (`jow.sync_favorites` + dialog) |
| `actions.rescue` | bool | `false` | Bouton « Sauver les périssables » — `jow.suggest` avec `rescue_expiry: true` : l'IA reçoit les ingrédients du planning qui expirent sous 3 jours (viandes, crèmerie, légumes frais) et génère une recette pour les écouler. Nécessite jow-meals ≥ 0.11.0. |
| `actions.import_jow` | bool | `false` | Bouton « Importer depuis Jow » — `jow.import_menu` : les plats ajoutés sur jow.fr/l'app mobile atterrissent sur les jours vides du planning (jamais d'écrasement). Rapport importé/ignoré en toast. Nécessite jow-meals ≥ 0.11.0. |
| `send_jow_mode` | string | `tabs` | Mode du bouton « Envoyer à Jow » : `tabs` = ouvre les recettes sur jow.fr (comportement historique) ; `service` = `jow.send_menu` — le menu du compte Jow se remplit jour par jour (dates + couverts). Nécessite jow-meals ≥ 0.11.0. |
| `attributes` | map | ha-jow | Correspondance attributs pour intégrations tierces (Mealie, Tandoor…) : `name`, `planned`, `image`, `url`, `date`, `calories`, `allergens`, `covers`, `duration`, `cooking_time`, `ingredients` |

## Interactions

- **Clic sur un jour** de l'index : l'affiche en détail (photo, composition, allergènes).
- **Drag & drop** d'une ligne planifiée (desktop) ou **appui long** (mobile) : déplace le plat (`copy_meal` + `clear_meal`).
- **Barre « Proposer un plat »** : recherche libre par jour, enrichie du thème du jour et du frigo.
- **± couverts** : ajuste les portions via `jow.set_covers`.
- **✕ sur un ingrédient** : le retire de la liste de courses (`jow.exclude_ingredient`).
- **ℹ** : popup du contexte IA — allergies, préférences, interdits/à éviter (modifiables), plats récents, thèmes, météo, agent IA.
- **Vue mensuelle** : clic sur un plat pour basculer sur sa semaine et l'afficher en détail.