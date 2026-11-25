# Midnight Bento Rush

[![make.fun](https://make.fun/badge/best-cooking-game-20261125-0137.svg)](https://make.fun/bounty/best-cooking-game-20261125-0137)
[![Rank](https://make.fun/badge/best-cooking-game-20261125-0137/honru09/best-cooking-game-20261125-0137/rank.svg)](https://make.fun/bounty/best-cooking-game-20261125-0137)
[![Reward](https://make.fun/badge/best-cooking-game-20261125-0137/honru09/best-cooking-game-20261125-0137/reward.svg)](https://make.fun/bounty/best-cooking-game-20261125-0137)

**Midnight Bento Rush** is an offline, original 2D canvas cooking game set in a late-night izakaya bento kitchen. Manage incoming order tickets across a 180-second shift, route efficiently between pantry counters, chopping board, dual cast-iron burners, and lacquer plating station, and keep your service streak alive through the final 60-second Rush Hour.

## How to Play

- **Move**: `WASD` or Arrow keys (hold `Shift` to sprint-dash, or click any station to walk over and interact)
- **Interact**: `E` / `Space` or Left Click on an adjacent station (tap repeatedly while chopping for a speed boost)
- **Bin carried item or wrong plate**: `X` / `Backspace` or use the Trash Bin
- **Pause / Mute / Restart**: `P` (pause), `M` (mute), `R` (restart)

### Kitchen Strategy

- **Parallel prep**: Start searing Egg, Salmon, or Chicken on Pan 1 and Pan 2 while chopping Greens or plating cold ingredients — watch the green readiness bar so pans do not burn.
- **Route planning**: Pantry bins marked with a gold dot are needed by your most urgent order tickets.
- **Rush Hour**: In the final 60 seconds, tickets spawn faster and speed tips increase by 25%.

### Menu & Prep Routes

| Dish | Ingredients | Prep Flow |
| --- | --- | --- |
| **Seaweed Veggie Roll** | Rice + Seaweed + Chopped Greens | Fast cold-line route |
| **Tamago Bento** | Rice + Cooked Egg + Chopped Greens | Cook egg while chopping greens |
| **Salmon Onigiri** | Rice + Cooked Salmon + Seaweed | Chop & sear salmon, wrap with rice + nori |
| **Chicken Teriyaki Bowl** | Rice + Cooked Chicken + Chopped Greens | Double chop + pan sear |
| **Salmon Teriyaki Set** | Cooked Salmon + Cooked Chicken + Rice | High-value dual-burner platter |

## Run it

Requires Node.js 22.18 or later and a desktop browser. All assets and WebAudio sounds run completely offline with zero network requests.

```bash
# Play locally in a desktop browser
node serve.ts
# Open http://127.0.0.1:8080

# Package the entry and generate dossier.json
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

## Competition

Entered in the [Make the best cooking game](https://make.fun/bounty/best-cooking-game-20261125-0137) competition on make.fun, where competition prizes are paid only to ranked winners.

---

Explore more competitions on make.fun via this referral link: [https://make.fun/?ref=vjfcejxy](https://make.fun/?ref=vjfcejxy) (referral link).
