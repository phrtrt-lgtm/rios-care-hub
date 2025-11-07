# Configuração do Firebase para Notificações Push no Android

## 1. Criar/Acessar Projeto Firebase

1. Acesse [Firebase Console](https://console.firebase.google.com/)
2. Crie um novo projeto ou use um existente
3. Anote o **Server Key** que está em: **Project Settings > Cloud Messaging > Server Key**

## 2. Adicionar App Android ao Firebase

1. No Firebase Console, clique em "Add app" (ou ícone do Android)
2. Preencha:
   - **Android package name**: `com.rioscarehubb.app` (IMPORTANTE: deve ser exatamente isso)
   - **App nickname**: RIOS Care Hub (opcional)
   - **Debug signing certificate SHA-1**: (opcional por enquanto)
3. Clique em "Register app"
4. **Baixe o arquivo `google-services.json`** - GUARDE ESTE ARQUIVO!

## 3. Preparar Projeto Local

```bash
# 1. Fazer git pull do projeto Lovable
git pull origin main

# 2. Instalar dependências
npm install

# 3. Buildar o projeto
npm run build

# 4. Adicionar a plataforma Android (se ainda não foi feito)
npx cap add android

# 5. Atualizar dependências nativas
npx cap update android
```

## 4. Configurar google-services.json

1. Copie o arquivo `google-services.json` que você baixou do Firebase
2. Cole em: `android/app/google-services.json`

**Estrutura esperada:**
```
seu-projeto/
├── android/
│   ├── app/
│   │   ├── google-services.json  ← AQUI
│   │   └── src/
│   └── build.gradle
```

## 5. Configurar Dependências do Firebase (build.gradle)

Abra `android/build.gradle` e adicione na seção `dependencies`:

```gradle
dependencies {
    classpath 'com.android.tools.build:gradle:8.0.0'
    classpath 'com.google.gms:google-services:4.4.0'  // Adicione esta linha
}
```

Abra `android/app/build.gradle` e adicione no FINAL do arquivo:

```gradle
apply plugin: 'com.google.gms.google-services'
```

Ainda no `android/app/build.gradle`, adicione nas `dependencies`:

```gradle
dependencies {
    implementation 'com.google.firebase:firebase-messaging:23.4.0'
    // ... outras dependências
}
```

## 6. Adicionar FIREBASE_SERVER_KEY ao Lovable

No Lovable, você precisa adicionar o **Server Key** do Firebase como secret:

1. O código já está preparado para usar `FIREBASE_SERVER_KEY`
2. O Server Key está em: Firebase Console > Project Settings > Cloud Messaging > **Server Key**
3. Copie esse valor e adicione como secret no projeto

## 7. Compilar e Rodar no Dispositivo

```bash
# 1. Sincronizar código web com Android
npx cap sync android

# 2. Abrir no Android Studio
npx cap open android
```

No Android Studio:
1. Espere a sincronização do Gradle terminar
2. Conecte um dispositivo físico Android (recomendado) OU inicie um emulador
3. Clique em "Run" (ícone ▶️ verde)

## 8. Testar Notificações

1. Abra o app no dispositivo
2. Faça login
3. Vá em **Minha Caixa**
4. Clique em **"Ativar notificações"**
5. Aceite as permissões
6. Gere uma nova cobrança no sistema
7. Você deve receber a notificação push!

## Troubleshooting

### Erro: "google-services.json not found"
- Certifique-se que o arquivo está em `android/app/google-services.json`
- Verifique se o package name no arquivo é `com.rioscarehubb.app`

### Erro: "UNREGISTERED" nos logs
- O token FCM não está registrado no Firebase
- Verifique se o `google-services.json` está correto
- Recompile o app completamente
- Desinstale e reinstale o app no dispositivo

### Notificações não chegam
- Verifique se o FIREBASE_SERVER_KEY está configurado corretamente
- Veja os logs em "View Backend" > Edge Functions > send-push
- Verifique se o token está ativo no banco de dados (tabela `push_subscriptions`)

### Como ver os logs da edge function
- No Lovable, clique em "View Backend"
- Vá em "Edge Functions"
- Selecione "send-push"
- Veja os logs de execução

## Comandos Úteis

```bash
# Ver logs do Android em tempo real
npx cap run android

# Rebuildar tudo
npm run build && npx cap sync android

# Limpar cache do Gradle (se tiver problemas)
cd android && ./gradlew clean
```

## Arquitetura do Sistema

1. **App Android** → Registra token FCM no Firebase
2. **EnablePushNative.tsx** → Envia token para Supabase (`push_subscriptions`)
3. **send-push edge function** → Usa Firebase Admin SDK para enviar notificação
4. **Firebase Cloud Messaging** → Entrega notificação ao dispositivo
5. **Service Worker** → Exibe notificação no dispositivo

## Notas Importantes

- O app precisa estar compilado com o `google-services.json` correto
- Tokens FCM expiram se o app for desinstalado ou dados limpos
- Notificações só funcionam em build de release ou debug assinado
- Em desenvolvimento, use um dispositivo físico para melhor resultado
