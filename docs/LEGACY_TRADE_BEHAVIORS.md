# Comportements métier hérités — conservés hors du parcours générique

État : 2 septembre 2026. Décision utilisateur : ne pas supprimer les capacités
spécialisées d’OpenTakeoff, mais les isoler et documenter leur ancien fonctionnement.

## Contrat courant AnvilTrace

Un outil décrit une méthode de mesure, pas un produit ni un métier :

| Outil | Quantité | Ce qui n’est PAS déduit automatiquement |
|---|---|---|
| Area, Rectangle, One-Click | Surface | Plancher, mur, tapis, maçonnerie |
| Surface Area | Surface = longueur × hauteur explicite | Mur ou revêtement mural |
| Linear, Curved Line | Longueur; surface supplémentaire si une épaisseur est explicitement renseignée | Plinthe, bordure, fer angle |
| Count, Répartition linéaire | Unités; dimensions et nominal conservés | Produit ou matériau |
| Déduction | Retrait de surface selon son rattachement existant | Type d’ouverture |
| K, Markups | Annotation hors quantités de take-off | Produit ou quantité facturable |

Le sens métier vient du Produit, de sa catégorie, de sa description, des données
de bibliothèque et du Project Map. Le rapport, le panneau Produits, le HUD, les
étiquettes et la synthèse du jeu annoté affichent Surface / Longueur / Unités.
Les méthodes contribuant à la même surface sont additionnées une seule fois.
Les pertes, multiplicateurs, hauteurs explicites, épaisseurs explicites et
déductions existants gardent exactement leur calcul.

## Inventaire de l’héritage et point d’isolation

| Héritage | Ancien comportement | État / emplacement conservé |
|---|---|---|
| Rouleau de tapis de 12 pieds | Tout segment ou côté de rectangle ≥ 11,98 pieds rendait le curseur orange, même sans Produit tapis | `legacyTradeBehavior.js::legacyRollWarning`, désactivé par défaut; seuil et tolérance conservés/testés |
| Extrusion automatique d’une Area | Avec H sur le Produit, affichage de périmètre × H en surface verticale et Area × H / 27 en CY, sans tracé Surface Area | `derivedPerimeterSurface=false`; formule archivée dans `legacyAreaReferences`; ancien total `totals.js::verticalWallSf` et présentation conditionnelle conservés, hors parcours courant |
| Floor / Wall / Border SF | Répartition par méthode de tracé, présentée comme si elle indiquait l’usage réel | `LEGACY_SURFACE_COLUMNS` archive le profil; `measurementPresentation.js::surfaceQuantity` expose une surface générique; aucune conversion des données stockées |
| Catalogue initial de revêtements | CPT-1, BRD-1, LVT-1, WD-1, VCT-1, SV-1, CT-1, RB-1, TR-1 avec motifs, pertes et couvertures prédéfinis | Déplacé intégralement dans `legacyFlooringDefaults.js`, réexporté depuis `canvasConstants.js` pour compatibilité; pas de semis automatique dans un nouveau projet |
| Calculateur de rouleaux | Coupe, largeur de rouleau, joints, matériel tapis/vinyle/caoutchouc | Moteurs `rollgoods.js`, `rollTakeoff.js` conservés; `rollGoodsUi=false`. Les configurations déjà enregistrées ne sont ni effacées ni recalculées différemment |
| Suggestions de couverture | Taux associés à des truelles/adhésifs/mortiers; proposition de coulis pour tuile 12×24×3/8 avec joint 1/8 et sac 25 lb | `coverageSuggestions=false`, dans les fiches et la bibliothèque. `coverage.js` et ses presets/formules restent disponibles |
| Coulis déjà configuré | Géométrie de tuile calculant une couverture et une quantité de sacs | **Compatibilité active pour les données explicites** : reste éditable et calculé si `material.grout` existe; aucune nouvelle suggestion automatique |
| Base de matériau seam_lf | Consommation tirée du plan de joints d’un rouleau | Cachée dans les nouveaux choix génériques; conservée et visible si déjà choisie sur le matériau |
| Vocabulaire vocal historique | Synonymes de revêtements permettant de désigner un TAG existant | Conservé dans `voiceIntent.ts` comme compatibilité d’identification, pas comme création de Produit; exemple tapis retiré de l’aide générale |
| Tableau de finis / lecture documentaire | Floor, Base, Wall, etc. réellement lus dans un tableau ou un calque PDF | Conservé dans les lecteurs de documents : ce sont des données/propositions sourcées, pas une classification imposée par Area |
| One-Click et murs/portes/hachures | Analyse des obstacles et ouvertures du dessin | Conservée : nécessaire au suivi du contour. Les mots « wall » dans ce moteur désignent la géométrie du document, pas la catégorie du Produit |

Les interrupteurs de `LEGACY_TRADE_FEATURES` sont une frontière de code, pas un
nouveau menu utilisateur ni un profil global réactivable accidentellement.
Une future réactivation devra être explicite, par projet/Produit/métier, avec
paramètres et vérifications adaptés — jamais en reconnaissant le nom d’un outil.

## Compatibilité et limites de cette tranche

- `measure_role: floor_area`, `surface_area`, `linear`, `count`, `count_run`,
  `deduct` restent inchangés. Renommer ces clés casserait le contrat Canvas/MCP.
- `floor_sf`, `wall_sf`, `border_sf` et `total_sf` restent dans les agrégats.
  `total_sf` est déjà leur somme : ne jamais additionner le total et ses parties.
- Les CSV/Excel/JSON historiques conservent leurs clés et en-têtes. Ils forment
  l’interface de compatibilité, **pas** le vocabulaire de l’interface courante.
  Un futur export générique devra être versionné, sans casser les anciennes feuilles Excel.
- Les traces explicitement dimensionnées restent dimensionnées. Cette tranche
  ne retire pas la surface L × H ni L × épaisseur d’un ancien projet.
- Les catégories et noms réels des Produits, matériaux, feuilles et niveaux
  ne sont pas anonymisés. Une catégorie « Brique » choisie reste « Brique ».
- Les unités SF, SY, LF, EA, m² et m restent des unités générales. Le code de
  conversion n’est pas un comportement spécifique au tapis.
- Les commentaires historiques et documents de preuve restent intacts; ce
  registre indique ceux qui ne décrivent plus le parcours utilisateur courant.

## Porte de réactivation future

1. Choisir un profil métier explicitement et définir sa portée.
2. Définir des paramètres réels : largeur de rouleau, produit, couverture,
   ouverture, hauteur, etc.; ne pas reprendre silencieusement les valeurs archivées.
3. Comparer quantités de base et quantités dérivées dans les tests.
4. Garantir ouverture/enregistrement identiques des anciens projets.
5. Donner à l’humain un aperçu et une possibilité d’annulation avant mutation.

La suite `measurementPresentation.test.ts` protège l’agrégation générique,
les déductions, les profils dormants et la conservation du catalogue historique.
