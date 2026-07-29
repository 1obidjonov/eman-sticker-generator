# Сборка Windows-дистрибутива

## Требования

- Windows 10/11 x64;
- Node.js 20 или новее;
- интернет-доступ для первой загрузки Electron и NSIS;
- установленный Git не обязателен для локальной сборки.

Рекомендуется собирать из чистой копии проекта и не переносить между
платформами каталог `node_modules`.

## Проверка и сборка

В PowerShell из корня проекта:

```powershell
npm ci
npm run audit:prod
npm run check
npm run package:win
```

Ожидаемый файл:

```text
release/Eman-Sticker-Generator-0.8.0-rc.5-x64.exe
```

Отдельная portable-сборка:

```powershell
npm run package:portable
```

Ожидаемый portable-файл:

```text
release/Eman-Sticker-Generator-Portable-0.8.0-rc.5-x64.exe
```

`npm run package:dir` создаёт распакованный каталог приложения для локальной
проверки без установщика.

## Цифровая подпись

Для внутреннего пилота можно использовать неподписанную сборку. Для публичной
раздачи настройте сертификат подписи кода через защищённые переменные окружения
или секреты CI:

```powershell
$env:CSC_LINK = "путь-или-защищённая-ссылка-на-сертификат"
$env:CSC_KEY_PASSWORD = "пароль-из-хранилища-секретов"
npm run package:win
```

Не сохраняйте сертификат и пароль в репозитории или release-архиве.

Проверка подписи:

```powershell
Get-AuthenticodeSignature .\release\Eman-Sticker-Generator-0.8.0-rc.5-x64.exe
```

Для публичного выпуска ожидается статус `Valid`.

## Контроль целостности

```powershell
Get-FileHash .\release\Eman-Sticker-Generator-0.8.0-rc.5-x64.exe -Algorithm SHA256
```

Сохраните SHA-256 рядом с карточкой пилотного прогона. Перед передачей:

1. Выполните `npm run audit:prod` и `npm run check`.
2. Установите сборку на чистый профиль Windows.
3. Проверьте создание шаблона, одну генерацию и экспорт PNG.
4. Перезапустите приложение и убедитесь, что данные сохранены.
5. Удалите приложение и убедитесь, что пользовательские данные сохранились.
6. Пройдите `docs/PILOT_TEST_CHECKLIST.md`.

Автоматический выпуск по тегу описан в `docs/CI_CD_RELEASE.md`.
Полная процедура Release Candidate — в `docs/RC_RUNBOOK.md`.

## Что входит в установщик

- production-код Electron и React;
- production-зависимости рендера, экспорта и парсинга;
- нативные модули Sharp;
- ресурсы Chromium для Linux-сборки;
- брендированная иконка и безопасный preload.

На Windows приложение автоматически использует установленный Chrome,
Microsoft Edge или путь, заданный в настройках.
