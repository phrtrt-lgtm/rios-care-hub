# 📱 Guia de Deploy Mobile — RIOS Proprietários

> **Para leigos** — Siga exatamente nessa ordem. Não pule etapas.

---

## 📋 Informações do App

| Campo | Valor |
|---|---|
| **Nome do app** | RIOS Proprietários |
| **Bundle ID (iOS)** | `app.rios.proprietarios` |
| **Package Name (Android)** | `app.rios.proprietarios` |
| **URL do portal** | https://portal.rioshospedagens.com.br |

---

## 🖥️ O que você vai precisar instalar no seu computador

### Para Android (Windows, Mac ou Linux):
- [Node.js LTS](https://nodejs.org) — versão 18 ou superior
- [Android Studio](https://developer.android.com/studio) — grátis, da Google
- [Git](https://git-scm.com/downloads) — para baixar o código

### Para iOS (somente Mac):
- Um **Mac** com macOS 13 (Ventura) ou superior
- [Xcode](https://apps.apple.com/br/app/xcode/id497799835) — grátis na App Store do Mac (leva uns 30 min pra baixar)
- [Node.js LTS](https://nodejs.org)
- [Git](https://git-scm.com/downloads)
- [CocoaPods](https://cocoapods.org) — instale rodando no Terminal: `sudo gem install cocoapods`

> 💡 **Não tem Mac?** Para iOS você pode alugar um Mac online pelo [MacinCloud](https://www.macincloud.com) (paga por hora).

---

## 🔑 Passo 1 — Exportar o código para o GitHub

1. Dentro do Lovable, clique no seu **nome do projeto** no canto superior esquerdo
2. Vá em **Settings → GitHub**
3. Conecte sua conta GitHub e clique em **"Push to GitHub"**
4. Anote o link do repositório que foi criado (ex: `https://github.com/seunome/rios-proprietarios`)

---

## 💻 Passo 2 — Baixar o código no seu computador

Abra o **Terminal** (Mac/Linux) ou **Git Bash** (Windows) e rode:

```bash
git clone https://github.com/SEU_USUARIO/SEU_REPOSITORIO.git
cd SEU_REPOSITORIO
npm install
```

> ⚠️ Substitua o link pelo link real do seu repositório.

---

## 🤖 Deploy para Android

### Passo 3A — Preparar o Android Studio

1. Abra o **Android Studio**
2. Vá em **SDK Manager** (ícone de engrenagem) → **SDK Tools**
3. Marque **"Android SDK Command-line Tools"** e clique OK

### Passo 4A — Adicionar a plataforma Android

No terminal, dentro da pasta do projeto:

```bash
npx cap add android
npx cap sync android
```

### Passo 5A — Abrir no Android Studio

```bash
npx cap open android
```

O Android Studio vai abrir automaticamente com o projeto.

### Passo 6A — Gerar o APK ou AAB para publicar

Dentro do Android Studio:

1. Clique em **Build → Generate Signed Bundle / APK**
2. Escolha **Android App Bundle (.aab)** — use esse para publicar na Play Store
3. Clique **Next**
4. Se não tiver uma keystore ainda:
   - Clique em **"Create new..."**
   - Preencha as informações (guarde a senha com segurança!)
   - Clique OK
5. Selecione **release** e clique **Finish**
6. O arquivo `.aab` vai aparecer em: `android/app/release/app-release.aab`

### Passo 7A — Publicar na Google Play

1. Acesse [Google Play Console](https://play.google.com/console)
2. Crie um app novo → coloque o nome **"RIOS Proprietários"**
3. Vá em **Produção → Criar nova versão**
4. Faça upload do arquivo `.aab`
5. Preencha as informações obrigatórias e envie para revisão (leva de 1 a 3 dias)

---

## 🍎 Deploy para iOS (precisa de Mac)

### Passo 3B — Adicionar a plataforma iOS

No terminal, dentro da pasta do projeto:

```bash
npx cap add ios
npx cap sync ios
```

### Passo 4B — Instalar dependências nativas do iOS

```bash
cd ios/App
pod install
cd ../..
```

### Passo 5B — Abrir no Xcode

```bash
npx cap open ios
```

O Xcode vai abrir automaticamente.

### Passo 6B — Configurar sua conta Apple

1. No Xcode, clique no projeto **"App"** na barra lateral esquerda
2. Vá na aba **"Signing & Capabilities"**
3. Em **Team**, selecione sua conta Apple Developer
   - Se não tiver, acesse [developer.apple.com](https://developer.apple.com) e assine o plano (US$99/ano)
4. O Bundle Identifier já está correto: `app.rios.proprietarios`

### Passo 7B — Gerar o arquivo para publicar

1. No Xcode, vá em **Product → Archive**
2. Aguarde o processo terminar (alguns minutos)
3. Na janela que abrir, clique em **"Distribute App"**
4. Escolha **"App Store Connect"** → Next → Next → Upload
5. Aguarde o upload terminar

### Passo 8B — Publicar na App Store

1. Acesse [App Store Connect](https://appstoreconnect.apple.com)
2. Vá em **Meus Apps → RIOS Proprietários**
3. Clique em **"+ Versão"**
4. Selecione o build que você acabou de fazer upload
5. Preencha as informações e envie para revisão da Apple (leva de 1 a 3 dias)

---

## 🔄 Como atualizar o app depois

Como o app carrega o conteúdo diretamente do portal (`portal.rioshospedagens.com.br`), **mudanças visuais e de funcionalidade publicadas no Lovable aparecem automaticamente no app** sem precisar de novo build.

Você só precisa gerar um novo build e republicar nas lojas quando:
- Instalar um novo plugin nativo no Capacitor
- Mudar o ícone ou splash screen do app
- Atualizar a versão do Capacitor

---

## 🆘 Problemas comuns

| Problema | Solução |
|---|---|
| `npx: command not found` | Instale o Node.js e reinicie o terminal |
| `pod: command not found` | Rode `sudo gem install cocoapods` |
| Xcode não abre | Certifique que o Xcode está instalado pela App Store |
| Erro de assinatura no Xcode | Verifique se sua conta Apple Developer está configurada |
| Build Android falha | Certifique que o Android Studio está atualizado |

---

## 📞 Resumo rápido dos comandos

```bash
# Primeira vez
git clone <url-do-repo>
cd <pasta>
npm install
npx cap add android   # ou ios
npx cap sync

# Após qualquer git pull
npm install
npx cap sync

# Abrir nas IDEs
npx cap open android
npx cap open ios
```

---

*Documento gerado para o projeto RIOS Proprietários — Portal de Proprietários RIOS Hospedagens*
