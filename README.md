# Menus KitchenDaily

App web qui affiche les menus KitchenDaily par programme (KY Minceur : Nutri+, Activ+, Essentiel, Consolidation ; KY Quotidien), semaine par semaine, avec filtres, alertes de seuil, planning et contrôle qualité.

- `index.html` : la page (GitHub Pages). Elle ne contient aucune donnée.
- `apps-script/` : l'API Apps Script qui lit en direct les fichiers R&D « Plan de menu KD KY Ultra frais » et « GAMME PRODUITS KD KY DB ».
- La logique (filtres, alertes, contrôle qualité) est dans `Core.gs`, recopié tel quel dans la page.

Accès aux données : code d'accès demandé à la première ouverture.
