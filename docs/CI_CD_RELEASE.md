# CI/CD и выпуск Eman Sticker Generator

Этап 8 использует два независимых автоматических контура и добавляет полный
жизненный цикл Windows Release Candidate.

## Quality workflow

Файл `.github/workflows/quality.yml` запускается для pull request, изменений в
`main`/`master` и вручную. Он:

1. устанавливает зависимости строго из `package-lock.json`;
2. проверяет production-зависимости через `npm audit`;
3. выполняет typecheck, production-сборку,  тесты и демо-экспорт;
4. сохраняет `release-verification.json`.

Используются актуальные официальные GitHub Actions:
[`actions/checkout@v7`](https://github.com/actions/checkout/releases),
[`actions/setup-node@v7`](https://github.com/actions/setup-node/releases) и
[`actions/upload-artifact@v6`](https://github.com/actions/upload-artifact/releases).

## Windows release workflow

Файл `.github/workflows/windows-release.yml` запускается:

- автоматически для Git-тега `v*`;
- вручную с существующим тегом и опциональной публикацией GitHub Release.

Workflow `.github/workflows/rc-release-request.yml` предоставляет безопасный
автоматизированный вход в тот же процесс. Создание ветки
`release/v<версия-package.json>` от зелёного `main` создаёт аннотированный тег
и запускает Windows workflow с `publish_release: false`. Ветка с другим именем
или неактуальным commit блокируется.

Порядок выпуска:

1. Сверка тега с версией в `package.json`.
2. Production-аудит, сборка и все тесты.
3. Проверка, что тег указывает на текущий commit.
4. Создание Windows x64 NSIS-установщика.
5. Запуск `win-unpacked/EmanStickerGenerator.exe` в скрытом smoke-режиме.
6. Проверка Authenticode, если настроен сертификат.
7. Тихая установка NSIS и проверка ярлыков.
8. Два smoke-запуска установленного приложения.
9. Тихое удаление с проверкой сохранности пользовательских данных.
10. Генерация CycloneDX SBOM.
11. Расчёт SHA-256 для каждого артефакта.
12. Повторная проверка файлов по `release-manifest.json`.
13. Сохранение workflow artifact и, при явном разрешении, GitHub prerelease.

## Секреты подписи

Для подписанного публичного релиза добавьте в GitHub Actions Secrets:

| Секрет | Назначение |
|---|---|
| `WINDOWS_CSC_LINK` | защищённая ссылка или base64-содержимое сертификата |
| `WINDOWS_CSC_KEY_PASSWORD` | пароль сертификата |

Без этих секретов workflow создаёт неподписанную сборку и помечает её как
пригодную только для внутреннего пилота. Параметр `publish_release: true`
требует действительную подпись и завершает workflow ошибкой без неё.

## Создание релиза

Перед тегом обновите версию и release notes, затем:

```bash
git tag -a v0.8.0-rc.3 -m "Eman Sticker Generator 0.8.0-rc.3"
git push origin v0.8.0-rc.3
```

Тег обязан существовать, совпадать с `package.json` и указывать на собираемый
commit. Push тега создаёт проверенный внутренний artifact, но не публикует
GitHub Release. Для подписанного prerelease повторно запустите workflow
вручную с `publish_release: true`. Ручная публикация не создаёт тег
автоматически.

## Состав release-набора

| Файл | Назначение |
|---|---|
| `Eman-Sticker-Generator-0.8.0-rc.3-x64.exe` | NSIS-установщик |
| `windows-smoke-report.json` | результат запуска упакованного приложения |
| `windows-lifecycle-report.json` | установка, два запуска, удаление и сохранность данных |
| `release-verification.json` | исходные release-проверки |
| `sbom.cdx.json` | CycloneDX-состав production-зависимостей |
| `release-manifest.json` | размеры, роли и SHA-256 всех файлов |
| `checksums.sha256` | контрольные суммы для внешней проверки |

`release-manifest.json` не доверяет одному имени файла: обязательный
Windows-установщик дополнительно проверяется по размеру и PE-заголовку `MZ`.

## Локальная подготовка метаданных

Без Windows-установщика можно проверить release-инструменты:

```bash
npm run release:prepare
```

После Windows-сборки:

```bash
npm run release:finalize:win
npm run release:verify-artifacts:win
```

## Проверка получателем

В PowerShell из папки релиза:

```powershell
Get-FileHash .\Eman-Sticker-Generator-0.8.0-rc.3-x64.exe -Algorithm SHA256
Get-AuthenticodeSignature .\Eman-Sticker-Generator-0.8.0-rc.3-x64.exe
```

SHA-256 должен совпасть со строкой в `checksums.sha256`, а публично
распространяемая сборка должна иметь Authenticode-статус `Valid`.

## Исправление релиза

Не заменяйте уже распространённый файл другими байтами под той же версией.
При ошибке остановите выдачу версии, исправьте проблему, увеличьте patch-номер
и выпустите новый тег. Это сохраняет однозначное соответствие версии,
манифеста и контрольных сумм.

Пошаговый выпуск кандидата: [`RC_RUNBOOK.md`](RC_RUNBOOK.md).
