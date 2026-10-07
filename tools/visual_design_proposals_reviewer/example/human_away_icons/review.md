# Human Away — comparaison d’icônes

- id: human-away-icons

- langue: fr

- page: preview.html

- single: preview_single.html

- dossier-svg: ./

- label-dossier: icons preview

- tailles: 24, 48, 72, 112

- fonds: dark = Fond sombre, light = Fond clair

- formats: svg

- prefix-local: human-away-preview

- verifications: rule_packs/check_human_away_french_chrome.py

- sur-titre: Human Away / Icônes

- titre: 37 icônes, une seule page pour comparer

## notes

- Chaque tuile est montrée aux mêmes tailles sur fond clair et sur fond foncé, et aucune SVG antérieure n’a été supprimée. Les lots ne sont plus des sections de la page : ils restent enregistrés dans le générateur, et la page ne présente que thèmes et familles.

## character — Concepts centrés sur le robot

Le premier tour partait du robot lui-même : rien n’accroche une porte, le personnage est le message.

### [ ] A — Robot de fête

- fichiers: icon_a_party.svg

- description: Chapeau de fête, confettis et grand sourire : un agent autonome joueur.

- note: Élément gardé : le chapeau de fête et les cotillons.

- alt: A : robot souriant avec chapeau de fête et confettis

- lot: 1

### [ ] B — Robot au travail

- fichiers: icon_b_work.svg

- description: Cravate, clé et café : l’agent s’occupe des affaires pendant votre absence.

- alt: B : robot au travail avec cravate, clé et café

- lot: 1

### [ ] C — Robot AFK

- fichiers: icon_c_afk.svg

- description: Un robot au repos et un écran AFK : une lecture littérale de l’absence.

- alt: C : robot au repos devant un écran affichant AFK

- lot: 1

### [ ] C1 — Au bureau, l’écran affiche AWAY

- sous-version: C

- fichiers: icon_c1_monitor_away.svg

- description: Le mot de l’écran de C passe de AFK à AWAY, dimensionné pour que le mot ne touche jamais le bord de l’écran.

- note: AFK a disparu : AWAY est dessiné en capitales de 51 px dans un écran de 184 unités, le mot dégage le cadre de tous les côtés.

- alt: C1 : robot à son bureau, écran affichant AWAY, badge AWAY

- lot: 4

### [ ] D — Robot de veille nocturne

- fichiers: icon_d_night.svg

- description: Lanterne, mug fumant et lune : l’agent veille toute la nuit.

- note: Le robot et sa lampe agrandis 1,3 fois autour de leurs pieds ; rien d’autre n’a été touché.

- alt: D : robot de veille nocturne avec lanterne sous la lune

- lot: 1

### [ ] D1 — Poste de nuit, robot endormi

- sous-version: D

- fichiers: icon_d1_sleeping_mouth.svg

- description: D avec une bouche endormie et le visage remonté pour que les yeux respirent au-dessus du col.

- note: Bouche endormie ajoutée (ronde comme sur W), yeux et joues remontés pour que les yeux respirent au-dessus du col.

- alt: D1 : robot endormi sous une lampe, yeux fermés, bouche ronde de sommeil, croissant de lune

- lot: 4

## features — Illustrations de fonctionnalités

Les tuiles de fonctionnalités du premier tour : ce que fait l’extension, dessiné comme un badge.

### [ ] E — Robot en pilote automatique

- fichiers: icon_e_autopilot.svg

- description: Un agent au volant : le travail autonome continue sans conducteur humain.

- note: Éliminée par la revue.

- alt: E : robot tenant un volant

- lot: 1

### [ ] F — Badge Do Not Disturb

- fichiers: icon_f_dnd.svg

- description: Un robot qui fait chut et un badge AWAY. Précédemment retenu comme icône temporaire.

- note: L’icône installée ; le tour sur lequel cette série itère.

- alt: F : badge de porte Do Not Disturb avec un robot qui fait chut

- lot: 1

### [ ] F1 — Pancarte de porte avec une tête de robot souriante

- sous-version: F

- fichiers: icon_f1_head_dnd.svg

- description: La pancarte de F, son trou percé et son clou, avec le visage humain remplacé par la tête du robot de P.

- note: Le visage humain est remplacé par la tête du robot de P, la tête seulement, même pancarte et même matériel.

- alt: F1 : pancarte de porte accrochée à un clou, tête souriante du robot P et DO NOT DISTURB

- lot: 4

### [ ] F2 — Pancarte de porte avec la tête du robot S

- sous-version: F

- fichiers: icon_f2_shead_dnd.svg

- description: La même pancarte avec la tête du robot S aux grands yeux, sa bouche recolorée pour le contraste.

- note: La tête du robot de S avec la bouche recolorée en fruits rouges sombres pour contraster avec le visage ; ce robot peut rester malheureux.

- alt: F2 : pancarte de porte accrochée à un clou, tête du robot S et DO NOT DISTURB

- lot: 4

### [ ] G — Phare-robot

- fichiers: icon_g_beacon.svg

- description: Rais ambrés, lune et étoiles : un phare discret pendant le travail sans surveillance.

- note: Éliminée, mais son croissant de lune est gardé pour les ambiances nocturnes.

- alt: G : phare à visage de robot projetant des rais ambrés pendant la nuit

- lot: 1

### [ ] H — Robot à pastille AWAY

- fichiers: icon_h_chip.svg

- description: Le robot présente sa propre pastille AWAY : un clin d’œil à l’interface de l’extension.

- note: Source de l’étiquette AWAY que toutes les icônes suivantes portent.

- alt: H : robot présentant une pastille AWAY ambrée

- lot: 1

## door — Pancarte de porte d’hôtel

Une pancarte sur une vraie porte d’hôtel, accrochée comme s’accroche une vraie pancarte. Une pancarte qui affiche DO NOT DISTURB ne porte pas d’étiquette AWAY.

### [ ] I — Pancarte accrochée à la porte

- fichiers: icon_i_hanger_dnd.svg

- description: Vraie silhouette de pancarte de porte sur une porte : visière de robot, bande rouge DO NOT DISTURB, pastille AWAY.

- note: La carte affiche DO NOT DISTURB, elle ne porte donc pas d’étiquette AWAY.

- alt: I : pancarte de porte d’hôtel sur une porte, visière de robot, bande DO NOT DISTURB, pastille AWAY

- lot: 2

### [ ] J — Accrochée au bouton de porte

- fichiers: icon_j_hanger_on_knob.svg

- description: La carte passée sur le bouton de porte, le bouton visible dans le trou, le robot toujours à côté.

- note: Le bouton de porte transparaît dans le trou ; la puce AWAY a disparu, la porte garde le message.

- alt: J : pancarte de porte d’hôtel accrochée à un bouton de porte avec le robot à côté

- lot: 2

### [ ] K — Cloche de notification barrée

- fichiers: icon_k_hanger_muted.svg

- description: Variante sans texte : une cloche de notification barrée remplace la bande, pastille AWAY conservée.

- note: Éliminée ; elle avait reçu un col en carton plein à la place de la fente sombre.

- alt: K : pancarte de porte d’hôtel avec cloche de notification barrée et pastille AWAY

- lot: 2

### [ ] R — Accrochée à une punaise rouge

- fichiers: icon_r_hanger_tack_dnd.svg

- description: La pancarte épinglée à la porte par une punaise rouge dans son trou ; robot aux yeux ronds ; DO NOT DISTURB seulement, pas de pastille AWAY, comme demandé.

- note: Une vraie porte désormais : huisserie, panneaux, chant, gonds, loquet. Pancarte plus large, robot heureux.

- alt: R : pancarte de porte d’hôtel accrochée à une punaise rouge, robot aux yeux ronds, DO NOT DISTURB

- lot: 3

### [ ] S — Ventouse sur la porte

- fichiers: icon_s_hanger_suction_dnd.svg

- description: Ventouse collée sur le panneau de la porte, carte pincée en dessous ; robot à points cyan ; disque barré et DO NOT DISTURB, pas de pastille AWAY.

- note: Vraie porte et ventouse ; DO NOT DISTURB affiché, donc pas d’étiquette AWAY.

- alt: S : pancarte de porte d’hôtel sur ventouse, robot aux yeux cyan, panneau DO NOT DISTURB

- lot: 3

### [ ] T — Crochet sur la poignée de porte

- fichiers: icon_t_hanger_hook_handle.svg

- description: Un crochet métallique enjambe le levier de poignée chromée et passe dans le trou de la carte ; visage de robot curieux, plaque AWAY sur le bas de la carte.

- note: Crochet taillé dans le carton qui enjambe le levier de poignée ; pancarte plus large, plaque AWAY en dessus.

- alt: T : pancarte de porte d’hôtel sur crochet métallique enjambant un levier de poignée, plaque AWAY

- lot: 3

### [ ] U — Crochet à vis, cloche barrée

- fichiers: icon_u_hanger_screw_bell.svg

- description: Crochet à vis en laiton dans le trou, une cloche barrée au lieu d’une bande de mots pour que la carte fonctionne dans n’importe quelle langue, plaque AWAY conservée.

- note: Éliminée ; elle avait reçu une vraie porte, un trou rond percé et un crochet en carton.

- alt: U : pancarte de porte d’hôtel sur crochet à vis en laiton, cloche barrée et plaque AWAY

- lot: 3

## vacation — Le robot part en vacances

Scènes de plage et de valise. Les palmiers sont dessinés avec des palmes et il n’y a pas de verres de cocktail : les deux pailles croisées se lisaient comme deux cuillères.

### [ ] L — Pancarte de plage

- fichiers: icon_l_vacation_beach_hanger.svg

- description: Pancarte maritime : la visière de robot porte des lunettes de soleil, bande ON VACATION et pastille AWAY.

- note: Garde son étiquette comme demandé ; palmier dessiné avec de vraies palmes, soleil déplacé.

- alt: L : pancarte de porte à la plage, visière de robot avec lunettes de soleil, ON VACATION et AWAY

- lot: 2

### [ ] L1 — Pancarte de plage, de jour

- sous-version: L

- fichiers: icon_l1_beach_placard.svg

- description: La pancarte de plage du lot 2 reconstruite : carte plus large, rond près du haut, bande DO NOT DISTURB à son pied, ciel et mer de V, et la plaque AWAY seule sur le sable.

- note: Pancarte élargie avec le rond près de son bord haut et le bandeau rouge DO NOT DISTURB à son pied ; ciel et mer de V derrière, plaque AWAY sur sa propre bande de sable, jamais posée sur autre chose.

- alt: L1 : scène de plage avec une large pancarte DO NOT DISTURB et un badge AWAY sur le sable

- lot: 4

### [ ] L1N — Pancarte de plage, de nuit

- sous-version: L

- fichiers: icon_l1n_beach_placard_night.svg

- description: La même scène de nuit, avec le croissant de lune repris de G.

- note: L1 de nuit : le croissant de lune de G remplace le soleil, mer sombre, même pancarte et même plaque.

- alt: L1N : scène de plage nocturne avec une large pancarte DO NOT DISTURB et un badge AWAY sur le sable

- lot: 4

### [ ] L2 — Pancarte de plage sur crochet taillé

- sous-version: L

- fichiers: icon_l2_carved_hook.svg

- description: Même plage, même pancarte, mais accrochée par un crochet rond taillé directement dans le bord gauche du carton plutôt que dans un trou percé.

- note: La pancarte de L1 accrochée par un crochet taillé directement dans le bord gauche du carton, sans trou percé.

- alt: L2 : scène de plage avec une pancarte DO NOT DISTURB accrochée par un crochet taillé dans le carton

- lot: 4

### [ ] M — Plantée dans le sable

- fichiers: icon_m_vacation_beach_planted.svg

- description: La carte plantée dans le sable près du parasol et d’un cocktail : BACK LATER, AWAY.

- note: Éliminée ; elle a aussi perdu le parasol et le cocktail qui se lisaient comme deux cuillères.

- alt: M : pancarte de porte plantée dans le sable de la plage à côté d’un parasol et d’un cocktail

- lot: 2

### [ ] N — Hors du bureau

- fichiers: icon_n_hanger_suitcase.svg

- description: La pancarte agrandie devient la valise elle-même, robot en chapeau de soleil sur la piste de décollage.

- note: Pas de porte dans la scène, donc l’encoche est pleine dans le carton.

- alt: N : valise en forme de pancarte de porte, bande OUT OF OFFICE et pastille AWAY

- lot: 2

### [ ] V — Carte plantée dans le sable

- fichiers: icon_v_vacation_sand_planted.svg

- description: Robot à paupières mi-closes sous une casquette plate, carte calée dans le sable près du verre, bande BACK LATER et plaque AWAY ambrée.

- note: Palmier plus grand et volumineux avec des palmes dessinées ; les deux verres de cocktail ont disparu.

- alt: V : pancarte de porte plantée dans le sable avec un robot aux lunettes de soleil, BACK LATER et AWAY

- lot: 3

### [ ] W — Accrochée comme une serviette

- fichiers: icon_w_vacation_towel_line.svg

- description: La carte pincée sur un fil à linge entre deux piquets ; yeux à demi fermés de sommeil, OUT OF OFFICE, AWAY.

- note: Éliminée ; elle avait reçu des palmes dessinées, aucun verre et un col plein.

- alt: W : pancarte de porte accrochée à un fil à linge de plage, visage de robot engourdi, OUT OF OFFICE et AWAY

- lot: 3

### [ ] X — Valise posée, robot sorti

- fichiers: icon_x_vacation_suitcase_robot.svg

- description: Le robot pose sa valise au bord de la mer et lève la carte : OFF DUTY, visage à lunettes de soleil et grande pastille AWAY.

- note: Éliminée ; elle avait reçu des palmes dessinées et un col plein.

- alt: X : robot avec une valise à la plage tenant une pancarte de porte, pastille AWAY

- lot: 3

## laptop — Le robot travaille sur son laptop

Le robot a remplacé l’humain au clavier, de face et de dos.

### [ ] O — L’écran fait le panneau

- fichiers: icon_o_hanger_as_screen.svg

- description: Le laptop affiche la pancarte en plein écran pendant que deux pattes continuent de taper.

- note: Le robot est face à nous devant le laptop ; l’humain a disparu, la puce AWAY aussi.

- alt: O : écran de laptop affichant une pancarte DO NOT DISTURB avec des pattes de robot qui tapent

- lot: 2

### [ ] O2 — Au laptop, vu de dos

- sous-version: O

- fichiers: icon_o2_laptop_back.svg

- description: Le même bureau vu de dos : le dos et la tête du robot masquent le bas du capot, la pancarte reste lisible au-dessus de l’écran.

- note: NOUVEAU : le même bureau vu de dos, le dos du robot masque le bas du capot.

- alt: O2 : robot vu de dos travaillant sur un laptop avec une pancarte DO NOT DISTURB sur le capot

- lot: 2

### [ ] P — Pancarte sur le capot

- fichiers: icon_p_hanger_on_laptop.svg

- description: Robot penché sur ses lignes de code, la pancarte posée sur le capot, un café pour une personne.

- note: Robot entier conservé, tasse agrandie 1,3 fois avec un bord sombre pour la détacher du capot.

- alt: P : robot travaillant sur un laptop avec une pancarte DO NOT DISTURB posée sur le capot

- lot: 2

### [ ] P1 — Robot au laptop avec sa tasse

- sous-version: P

- fichiers: icon_p1_away_plate.svg

- description: P sans son étiquette de porte, souriant, tasse agrandie avec l’anse à gauche, et la plaque AWAY placée sous la table au lieu de dessus.

- note: Étiquette de porte supprimée, la ligne du ventre est devenue un sourire, tasse agrandie avec l’anse à gauche, et le dessin remonté pour que la plaque AWAY tienne sous la table avec un espace en dessous.

- alt: P1 : robot souriant devant un laptop avec une tasse et un badge AWAY sous la table

- lot: 4

### [ ] Q — Travail profond, casque sur les oreilles

- fichiers: icon_q_hanger_sticker_lid.svg

- description: Casque sur les oreilles, la carte scotchée sur le capot ouvert : QUIET et la pastille AWAY.

- note: Table de travail réduite et refroidie ; le robot au casque est extrait pour que Q2 le reprenne.

- alt: Q : robot au casque derrière un capot de laptop scotché d’une pancarte QUIET

- lot: 2

### [ ] Q2 — Casque sur un établi en bois

- sous-version: Q

- fichiers: icon_q2_hanger_wood_laptop.svg

- description: Le même robot, même casque et même capot que Q, posé sur un petit établi en bois plutôt que sur une large table en aluminium.

- note: NOUVEAU : le même robot sur un petit établi en bois.

- alt: Q2 : robot au casque derrière un laptop posé sur un établi en bois, pancarte QUIET et badge AWAY

- lot: 2

### [ ] Q3 — Robot face à nous devant un laptop ouvert

- sous-version: Q

- fichiers: icon_q3_front_laptop.svg

- description: Q3 ouvre le capot pour que le robot le remplisse, pose la pancarte sur le clavier et la reconstruit sur le modèle de O.

- note: Rien ne masque plus le capot ; écran et clavier sont alignés à la ligne de contact avec deux rangées de touches ; oreilles et antenne de P sont revenues ; pancarte de O reconstruite avec le rond près du haut. Elle affiche DO NOT DISTURB, donc pas d’étiquette AWAY.

- alt: Q3 : robot face à nous dans un laptop ouvert, avec oreilles, antenne et pancarte DO NOT DISTURB

- lot: 4

### [ ] Y — Pancarte épinglée sur le capot

- fichiers: icon_y_laptop_lid_hanger.svg

- description: Robot concentré aux paupières mi-closes qui tape sous ses pattes ; la pancarte est épinglée sur l’écran par une punaise rouge et affiche DO NOT DISTURB, donc pas de plaque AWAY.

- note: La carte DO NOT DISTURB ne porte pas d’étiquette AWAY ; pas de porte, donc pas d’encoche.

- alt: Y : robot devant un laptop avec une pancarte de porte DO NOT DISTURB épinglée sur l’écran

- lot: 3

### [ ] Z — L’écran parle pour lui

- fichiers: icon_z_laptop_screen_away.svg

- description: L’écran garde le visage de robot curieux pendant que la pancarte pend au bord du capot : SHIPPING CODE et une plaque AWAY flottant au-dessus du bureau.

- note: Pas de porte, donc pas d’encoche ; plaque AWAY centrée en haut de la tuile.

- alt: Z : laptop avec un visage de robot à l’écran et une pancarte SHIPPING CODE au bord du capot, plaque AWAY

- lot: 3

## elements

### [ ] hat — Chapeau de fête et cotillons

- fichiers: idea_a_party_hat_confetti.svg

- description: Le chapeau de fête et les cotillons d'A peuvent revenir sur n'importe quelle autre proposition.

- alt: Tuile d’élément réutilisable : le chapeau de fête de A avec ses confettis

- extrait-de: A


### [ ] moon — Croissant de lune, ambiance nocturne

- fichiers: idea_g_crescent_moon.svg

- description: Le croissant de lune de G reste disponible dès que l'ambiance doit être nocturne.

- alt: Tuile d’élément réutilisable : le croissant de lune de G avec ses étoiles

- extrait-de: G

- pour: L1N


### [ ] mouth — Bouche contrastée sur le visage du robot

- fichiers: idea_s_mouth_contrast.svg

- description: La couleur de la bouche doit trancher avec le visage du robot. Ce robot peut, par exception, ne pas être heureux, alors que tous les autres restent heureux.

- alt: Tuile d’élément réutilisable : la bouche de S avant et après recoloration

- extrait-de: S

- pour: F2


## lots

- Lot 1 : les huit premières propositions (A-H) — Concepts centrés sur le robot et badges de fonctionnalités, dessinés avant le choix de la pancarte de porte

- Lot 2 : itérations sur F, le badge Do Not Disturb (I-Q) — Une vraie silhouette de pancarte, plusieurs visages de robot, et l’étiquette AWAY de H dimensionnée pour tenir dans une icône de 48 px

- Lot 3 : itérations sur les icones du lot 2 (R-Z) — La porte elle-même devient reconnaissable à 48 px, et l’accroche est soit un trou rond percé dans la pancarte, soit un crochet taillé dans le carton

- Lot 4 : adaptations demandées après la revue du lot 3 (C1, D1, F1, F2, L1, L2, P1, Q3) — Chaque tuile répond à une ligne de la revue : le mot de l’écran, la bouche endormie, la tête du robot P ou S dans la pancarte de F, la pancarte de plage reconstruite avec son rond près du haut et la plaque AWAY sur sa propre bande de sable, un crochet taillé dans le carton, P sans son étiquette de porte et avec la plaque sous la table, et Q3 sans rien qui masque le capot

## guide

- La page n'a que trois sections : Propositions de design , Éléments réutilisables identifiés lors de la revue et Versions éliminées ; cette dernière reproduit les mêmes sous-sections que les propositions.

- Le bouton radio en haut à droite marque la tuile que tu gardes comme favori.

- La croix élimine la tuile ; un second clic sur la croix la restaure.

- Le badge sous la croix qualifie la maturité de la version : « Version de travail » (bleu, par défaut) ou « Version finale » (vert).

- Éliminer ou restaurer une tuile ne change jamais son statut de maturité.

- « Revenir aux versions de travail » et « Tout marquer en version finale n'agissent que sur les tuiles affichées dans Propositions de design.

- Chaque sous-section affiche <tuiles affichées> / <tuiles du thème, éliminées comprises>.

- La barre fixée en bas de fenêtre rassemble les versions éliminées dans leur section, puis remet chaque tuile dans sa section d'origine, à son emplacement initial.

- Ces états sont mémorisés d'un lot de production à l'autre, et rien ici ne modifie l'extension.

## footer

- Familles : A–D sont des concepts centrés sur le personnage, E–H illustrent les fonctionnalités de l’extension, I–Q itèrent sur F (le badge Do Not Disturb) avec un visage de robot et la pastille AWAY de H, et R–Z font de la carte une vraie pancarte de porte avec une accroche visible (punaise, ventouse, crochet sur la poignée) — une carte DO NOT DISTURB ne porte pas de pastille AWAY. Aucune proposition n’est sélectionnée par défaut.


- Galerie hors ligne : les SVG vivent à côté de cette page dans {folder_slot}. Aucun script distant, aucune police distante, aucune requête réseau.


- Choisir une carte ne vaut pas approbation de l’installation.

- lien: Record d’application de l’icône
- url: ../../../../ai-automation-tools/plans/PLAN_HUMAN_AWAY_ICON_ACTION.md

## eliminations

- E

- G

- K

- U

- M

- W

- X
