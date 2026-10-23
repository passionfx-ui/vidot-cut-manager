# comfyui-gonggan-cut 개발 맥락 (2026-10-19 기준)

이 문서는 다른 봇이나 Cursor가 대화 기록 없이도 이어서 작업할 수 있게 쓴 인수인계 문서다. 바뀐 결정이 생기면 이 문서를 같이 고칠 것.

## 1. 무엇을 만드는가
- ComfyUI 안에서 쓰는 **샷 관리 + 가편집(rough-cut) 편집기** 커스텀 노드 팩.
- 출발점은 사용자의 웹앱 **공간쉐어**(별도 프로젝트, `server.py`가 8765 포트로 웹 UI를 띄우고 ComfyUI 8188에 작업을 보냄). 공간쉐어의 샷 관리 개념을 ComfyUI 탭으로 옮긴 것.
- 강점: **프리미어처럼 간단한 편집** — 타임라인, 자르기(trim), 순서 바꾸기, 이어서 재생, 내보내기를 ComfyUI 안에서 바로.
- 포지셔닝: 새 모델이나 단일 기능이 아니라 **UI/UX 혁신**. ComfyUI 기본 UI는 샷/버전 관리와 편집이 약하다("컴피쪽이 아주 구려").
- ComfyUI의 App Mode / App Builder(워크플로 하나를 간단한 입력·출력 화면으로 감싸는 기능)와는 겹치지 않는다. 그건 "한 번 뽑는 화면"이고, 우리는 여러 결과를 모아 정리·편집하는 쪽. 사용자는 App Builder가 복잡해서 잘 안 쓸 것 같다고 봄.

## 2. 공모전
- Comfy "Open Source Higgsfield" (https://comfy.org/open-source-higgsfield/). 목표 부문: **Most Innovative**.
- 마감: **2026-10-31 01:00 KST** (10/30 09:00 PT).
- 규칙 #1: Comfy Developer Platform(Comfy Router 및/또는 Comfy SDK)으로 만들어야 함 → 이 팩은 **comfy-sdk + comfy-api-proxy(127.0.0.1:8189)**로 로컬 ComfyUI를 구동해 충족.
- 제출물: 공개 저장소(OSS 라이선스 + 로컬 실행 방법), 2분 미만 데모 영상, `#OpenSourceHiggsfield` 소셜 포스트. 라이브 링크는 선택(권장).
- MiniMax H3 보너스는 메인 상과 중복 가능.

## 3. 결정 사항 (시간순)
- 2026-10-24: **제품 원칙** — “정리를 같이 하면서 만드는 UI”: 새 결과는 해당 샷/그룹에 바로 쌓이고, 대표 지정·그룹·순서는 결과가 보이는 곳에서 원클릭(별도 정리 단계 없음). **데이터 모델**: project → group(=scene, 프로젝트별) → shot(에셋 + 그 워크플로). 타임라인 클립은 샷의 **대표(promoted)** 버전 미디어·길이를 따른다; 편집은 `edits/edit_<pid>.json`의 `pick` + trim.
- 2026-10-19: 공모전 출품작을 **샷 관리 프로그램**으로 확정. 이전 후보였던 comfy-virtual-set(가상 세트 고정 bake)은 메인에서 빠지고 나중 선택 기능.
- 공모전 버전은 **가편집 기능부터**. 그 정도로 충분하고, 기능은 나중에 추가.
- export가 돼야 사람들이 실제로 쓴다 → 현재 mp4 내보내기 있음. XML/EDL/OTIO는 나중.
- 로컬과 클라우드 둘 다 적용 가능한 구조(샷 관리 부분만 담당하므로 백엔드와 무관).
- 최종 이미지는 Google Flow의 나노바나나 2.1에서 뽑는다. 로컬 생성은 구도 확인용 **가벼운 초안(draft)** 전용.
- **방향 전환 검토 중(미확정, 가장 유력)**: 프로젝트별 컷 관리는 컴피 사용자에게 무거울 수 있다. 대신
  - ComfyUI의 **미디어 에셋(Media Assets)** 목록을 결과 모음("빈")으로 활용해, 생성 결과가 자동으로 쌓이고
  - **컷별 그룹화**(에셋에 컷 태그를 달아 버전을 묶음)
  - 빈에서 끌어서 타임라인에 놓고 → 자르고 → 내보내기
  - 프로젝트/컷 관리는 원하는 사람만 쓰는 선택 기능.
  사용자 반응은 긍정적("좀더 다듬으면 너무 좋은 기능"). 다음 작업 1순위 후보.
- **2026-10-24: 씬(Scene) = 컷 그룹.** UI 라벨은 **씬/Scene**. 데이터 모델: **프로젝트 > 씬(프로젝트별) > 샷(Shot)**. **샷** = 선택된 결과 미디어(영상/이미지) + 그걸 만든 워크플로/버전 한 묶음. 초기 씬 구성은 공간쉐어 `cut.scene` / `cut.scene_id` 연속 구간에서 읽고, 사용자가 만든 씬·이름·재배치·접기 상태는 팩 `edits/edit_<pid>.json`의 `groups: [{id,name,cut_ids,collapsed}]`에만 저장(타임라인 순서/trim `reset`과 별개로 유지). `POST /gonggan/groups`로 저장·검증.
- **2026-10-24: 제품 원칙 — "정리를 같이 하면서 만드는 UI".** 새 결과가 해당 샷/씬에 바로 붙고, 승격(pick)·씬 묶기·순서 변경을 결과가 보이는 곳에서 한 번에. 따로 정리 단계 없음.
- 저장소: 이 비공개 저장소는 개발용(전체 기록 + 맥락). 공개는 **새 공개 저장소에 깨끗한 코드만 한 커밋으로**.
- 팩/저장소 이름은 아직 임시. 10/26 이전(README·데모 전)에 확정 예정. 바꿀 때 저장소·폴더·탭 이름을 함께 바꿀 것.
- 2026-10-24: **Shot(샷) = 선택된 버전의 결과 에셋(이미지/영상) + 그 컷을 뽑는 드래프트 워크플로**를 한 단위로 본다. Shots 탭에서 컷을 클릭하면 미리보기·타임라인 선택/시크와 캔버스 워크플로 로드를 함께 한다. 프롬프트가 없어 워크플로를 못 만들면 에셋만 보여 주고 토스트로 알린다(큐/생성 없음).

## 4. 절대 규칙
1. ComfyUI 본체(코드, 기본 UI) 수정 금지. 공식 확장 API만.
2. GPU 무리 금지: 테스트는 짧고 가볍게, 긴 연속 부하·반복 전체 재생성 금지, 실패하면 처음부터 재시도하지 말고 멈추고 보고.
3. 생성 전 보고: 컷, 모델, 설정, 시드, 프롬프트를 사용자에게 먼저 알리고 허락받은 뒤 **한 작업만** 큐. 자동 재시도는 최대 1회까지만, 허락 범위 안에서.
4. ComfyUI는 항상 보이는 창으로 실행하고 Chrome에서 `http://127.0.0.1:8188/`. 작업 후 내가 띄운 ComfyUI·프록시·Chrome은 끄고 8188/8189 포트가 내려갔는지 확인. **사용자가 직접 띄운 ComfyUI는 건드리지 않는다.**
5. 공간쉐어 서버(8765)와 그 데이터는 건드리지 않음(읽기 전용).
6. Comfy Cloud를 쓸 경우 개인 워크스페이스만. 회사 계정 절대 금지.
7. 파일 수정은 UTF-8로, 수정 후 파일 크기/내용이 비지 않았는지 확인.
8. 영상 생성 테스트는 하지 않는다(가상 세트 작업 관련 지시).
9. 큰 문제가 아니면 묻지 말고 진행, 단 큰 방향 전환은 신중히. 진행은 짧게 보고.

## 5. 환경 (사용자 Windows PC)
- PC: DESKTOP-MKI867B, 사용자 `msk`. GPU는 Intel Arc Pro B70 (XPU), **NVIDIA 없음** → CUDA 전용 도구 불가.
- ComfyUI: `C:\ComfyUI_windows_portable\ComfyUI` (0.41.2, frontend 1.55.17, 내장 Python 3.13), 실행은 `run_intel_gpu.bat`.
- 이 팩 위치: `C:\dev\comfyui-gonggan-cut`, `custom_nodes`에 junction으로 연결:
  `mklink /J C:\ComfyUI_windows_portable\ComfyUI\custom_nodes\comfyui-gonggan-cut C:\dev\comfyui-gonggan-cut`
- ffmpeg가 PATH에 있음, PyAV 사용.
- SDK용 별도 venv `.venv-sdk` (Python 3.13.6, comfy-sdk 0.5.0, comfy-api-proxy 0.1.6). ComfyUI 자체 Python은 건드리지 않음.
- 공간쉐어: `C:\Users\msk\Desktop\gonggan-share-bot` (`server.py`, `static/app.js`), 데이터 `data\<uid>\_workspace.json` (uid `demo`). 공간쉐어 영상 워커는 8188 ComfyUI를 종료시키므로 ComfyUI 프로세스 안에서 같이 돌릴 수 없다.
- 맥(128GB Mac Studio)도 있고 상시 전원이지만, 2026-10-19 기준 개발은 계속 Windows PC에서 하기로 함. 맥에서 할 경우 ComfyUI를 맥에 설치하면 탭·편집·내보내기 테스트 가능(공간쉐어 데이터는 맥에 없음 → 미디어 에셋 방식이면 해결).

## 6. 구조
```
__init__.py                    WEB_DIRECTORY="./web", routes는 try 안에서 import
routes.py                      aiohttp 라우트 (/gonggan/*, /api/gonggan/* 동일)
gg_data.py                     공간쉐어 _workspace.json 읽기 전용 로더
gg_export.py                   mp4 내보내기 워커 (libx264 veryfast, 4 threads, 낮은 우선순위)
gg_sdk.py                      SDK venv 호출, 재생성 워크플로 구성, 프롬프트 정리
sdk_runner.py                  .venv-sdk에서 실행되는 comfy-sdk 러너 (1,500초 타임아웃 후 취소)
start_proxy.bat                comfy-api-proxy를 127.0.0.1:8189로 실행
gonggan_settings.default.json  data_root, uid (복사해서 gonggan_settings.json으로, gitignore)
web/gonggan.js, gonggan.css    UI (클래스는 gg- 접두사)
edits/  versions/  cache/      팩 전용 쓰기 폴더 (gitignore)
```
UI:
- 사이드바 탭 **Shots** (`registerSidebarTab`): 프로젝트 선택 + 컷 목록 썸네일, 컷 패널(버전 선택, Regenerate 드라이런+확인, Send last output), SDK 배지.
- 하단 패널 탭 **Timeline** (`bottomPanelTabs`, id `gg-timeline`): 한 줄 비디오 트랙, 클립 폭은 각 컷의 `tl_sec`. 순서 바꾸기는 포인터 이벤트(HTML 드래그앤드롭은 ComfyUI가 파일 드롭=워크플로 로드로 가로채서 안 씀), 자르기, 순서대로 재생, 내보내기.

라우트:
- `GET /gonggan/settings`, `/projects`, `/timeline?pid=`, `/media?id=`(data_root/uid 안으로 제한), `/poster?id=`(ffmpeg 썸네일 → cache)
- `POST /gonggan/edit`(순서+trim을 `edits/edit_<pid>.json`에 저장, 실제 길이에 맞춰 clamp), `POST /gonggan/edit/reset`(기존 파일을 `.reset-<ts>.json`으로 이름 변경; `groups`는 백업 파일에 같이 들어감)
- `POST /gonggan/groups` — 씬(컷 그룹) 생성·이름·삭제(컷만 미분류)·할당·접기; `groups` 배열 전체 저장, `cut_ids`는 프로젝트 컷만 허용
- `POST /gonggan/export`, `GET /export/status`, `POST /export/cancel`, `GET /export/file` → 결과 `ComfyUI\output\gonggan\`
- `GET /gonggan/sdk/status`, `POST /gonggan/regen`(기본 드라이런, `{"dry_run": false, "confirm": true, "seed": ...}`일 때만 큐), `GET /regen/status`
- `GET /gonggan/last-output`, `POST /gonggan/send-output`(ComfyUI 마지막 결과를 컷 버전으로 복사)
- 새 버전은 `versions/<pid>/<cut_id>/`에 저장되고 `edits/edit_<pid>.json`에서 그 컷의 선택본이 됨. 공간쉐어 데이터에는 절대 쓰지 않음.

SDK 경로:
```
ComfyUI(팩 라우트) -> .venv-sdk python sdk_runner.py -> comfy-sdk (COMFY_BASE_URL=http://127.0.0.1:8189)
                   -> comfy-api-proxy :8189 -> ComfyUI :8188
```
초안 재생성 워크플로: Qwen-Image 2.1 + turbo LoRA, 4 steps, cfg 1, euler/simple, 약 0.25MP(공간쉐어와 같은 그래프).

## 7. 진행 상태 (태그)
- `mvp-day1` 팩 뼈대, 읽기 전용 라우트, Shots 탭 + Timeline 탭, 썸네일 캐시
- day2 편집 저장(순서/trim), reset, 재생 UI
- `mvp-day3` 미리보기 크기/레이아웃
- `mvp-day4` mp4 내보내기 (테스트: 720p, 63.6초, 2.9MB)
- `mvp-day5-prequeue` SDK venv 러너, 프록시, 재생성 드라이런/확인, send-last-output, 버전 선택
- `mvp-day5` (6633427) 프롬프트 정리(None/null/빈 조각 제거), 러너 타임아웃+취소, 렌더 시간 기록
  - 승인된 테스트 렌더 1회 성공: 프로젝트 "박 속의 이름", 컷 1 "제비와 흥부", 시드 1053860076, 672×384, ComfyUI 실행 46.7초(첫 모델 로딩 포함), 제출→저장 51.3초. 타임라인에 컷 1 v5(SDK 배지)로 표시.

## 8. 알려진 문제 / 다음 할 일
- 새 버전의 이미지 크기가 타임라인 데이터에 안 나옴 → 안정화 때 수정.
- 영상 컷 사이 재생 시 짧은 끊김(gapless 재생은 나중).
- 일정:
  - ~10/25: (유력) 미디어 에셋 기반 빈 + 컷별 그룹화로 가볍게 전환
  - 10/26–27: 안정화, README, LICENSE, 이름 확정
  - 10/28–29: 데모 영상(2분 미만), 제출 글
  - 10/30: 여유분, 제출 / 새 공개 저장소 생성
- 나중 기능: XML/EDL/OTIO 내보내기, 전환·오디오, 초안 모드, Google Flow 결과 가져오기, 클라우드로 올려 뽑기, 실행 취소(undo), gapless 재생, 가상 세트 고정(comfy-virtual-set) 연동.
