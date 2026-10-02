# Survival character assets

The user requested Shin-chan's friends/family, Shiro, Hello Kitty and Dooly's friends and stated permission to use the characters. This is not a legal rights determination.

Verified character sources:

- https://www.tv-asahi.co.jp/shinchan/character/
- https://www.sanrio.co.jp/characters/hellokitty/
- https://www.doolymuseum.or.kr/html/sub01/sub01_0104.php

`official-v1/`: locally hosted source images; no third-party runtime image requests.
`dooly-cast-cutouts-v1.png`, `michol-cutout-v1.png`: built-in image generation background extraction from the museum images. Prompt: preserve recognizable full-body identities, remove the exterior white panel, retain white body/clothing interiors, true transparent margins; five-character 3×2 atlas and separate Michol cutout. Edited illustrations are not official originals.
`survival-human-cast-v1.png`: built-in generated original human cartoon sprite atlas, eight columns and ten measured rows. Prompt: 80 distinct full-body human cartoon people, kids/adults and varied costumes/occupations, separate transparent gutters, no animals/robots/food characters, no text. 74 cells supplement the 31 familiar casts; unused cells are not assigned.

105 named display identities. The first 16 are the requested cast. Mapping is participant-index based and does not affect elimination, winners, points or orders. The measured row edges prevent uniform-grid neighbour leakage. Tests: `scripts/test-survival-character-art.mjs` and `scripts/test-event-widget-readonly.mjs`.
