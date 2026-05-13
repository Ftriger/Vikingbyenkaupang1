# Kaupang Vikingby – Nettside

Offisiell nettside for Kaupang Vikingby i Larvik, Vestfold.

## Kom i gang

### Forhåndskrav
- [GitHub-konto](https://github.com)
- [Vercel-konto](https://vercel.com) (gratis)

---

## Deploy til GitHub + Vercel (steg for steg)

### 1. Opprett GitHub-repository

```bash
# I terminalen, fra prosjektmappen:
git init
git add .
git commit -m "Initial commit: Kaupang Vikingby nettside"
```

Gå til [github.com/new](https://github.com/new) og opprett et nytt repository kalt `kaupang-vikingby`.

```bash
git remote add origin https://github.com/DITT-BRUKERNAVN/kaupang-vikingby.git
git branch -M main
git push -u origin main
```

### 2. Koble til Vercel

1. Gå til [vercel.com](https://vercel.com) og logg inn
2. Klikk **"Add New Project"**
3. Velg **"Import Git Repository"** og velg `kaupang-vikingby`
4. Framework Preset: **Other** (ingen framework, ren HTML)
5. Root Directory: `/` (standard)
6. Klikk **Deploy**

Vercel gir deg automatisk en URL som `kaupang-vikingby.vercel.app`.

### 3. Eget domene (valgfritt)

I Vercel Dashboard → Settings → Domains → legg til `kaupangvikingby.no`.
Oppdater DNS hos din domeneregistrar med Vercel sine nameservere.

---

## Prosjektstruktur

```
kaupang/
├── index.html      # Hele nettsiden (én fil, ingen byggsteg)
├── vercel.json     # Vercel konfigurasjon
├── robots.txt      # SEO: søkemotorinstuksjoner
├── sitemap.xml     # SEO: nettstedskart
└── README.md       # Denne filen
```

## Oppdatere innhold

Rediger `index.html` direkte. Push til GitHub, og Vercel deployer automatisk.

```bash
git add index.html
git commit -m "Oppdaterer åpningstider for 2025"
git push
```

## SEO-optimaliseringer inkludert

- ✅ Meta description og keywords
- ✅ Open Graph (Facebook/sosiale medier)
- ✅ Twitter Card
- ✅ Schema.org strukturerte data (TouristAttraction)
- ✅ Canonical URL
- ✅ robots.txt
- ✅ sitemap.xml
- ✅ Semantisk HTML (landmark-elementer, ARIA)
- ✅ Mobiloptimalisert (responsive design)
- ✅ Rask lastetid (ingen JavaScript-rammeverk)

## Kontakt og innhold

- **Kaupangprosjektet** · post@kaupangprosjektet.no · +47 906 22 744
- [Facebook](https://www.facebook.com/profile.php?id=6156069640471810)
- [vikingbyen.org](https://vikingbyen.org/)
