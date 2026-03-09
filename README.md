# tLauncher

Tomcat 기반 웹 애플리케이션을 빌드, 배포, 실행하기 위한 Windows용 실행 도구입니다.

이 프로그램은 프로젝트를 빌드한 뒤 생성된 WAR 파일을 Tomcat Base의 `gtapps`에 배포하고, Tomcat을 실행합니다. 여러 실행 환경을 프로필로 저장해두고 필요할 때 바로 불러와 사용할 수 있습니다.

## 주요 기능

- 프로젝트 빌드 후 WAR 자동 배포
- `CATALINA_HOME`, `CATALINA_BASE` 분리 환경 지원
- 프로필별 실행 경로와 옵션 저장
- `server.xml`, `web.xml`, `context.xml` 설정 확인
- 실행 로그 확인 및 전체 보기
- 실행 중 `Stop` 버튼으로 중지 요청 가능

## 준비물

사용 전에 아래 항목이 준비되어 있어야 합니다.

- 빌드 가능한 Maven 프로젝트
- Tomcat Home 경로
- Tomcat Base 경로
- `mvn.cmd` 파일 경로
- Tomcat Base 아래 `conf`, `gtapps` 폴더

Tomcat Base `conf` 폴더에는 아래 파일이 있어야 합니다.

- `server.xml`
- `web.xml`
- `context.xml`

## 화면 설명

### Profiles

- 실행 환경을 저장하고 선택하는 영역입니다.
- `새 프로필`로 새 실행 환경을 만들 수 있습니다.
- `삭제`로 현재 프로필을 제거할 수 있습니다.

### Workspace

선택한 프로필의 실행 정보를 입력하는 영역입니다.

- `Profile Name`: 프로필 이름
- `Description`: 프로필 설명
- `Project Directory`: 빌드할 프로젝트 경로
- `Tomcat Home`: Tomcat 설치 경로
- `Tomcat Base`: 실행 환경 경로
- `Maven Path`: `mvn.cmd` 파일 경로
- `Build Command`: Maven에 전달할 명령어
- `Tomcat Options`: Tomcat 실행 옵션

각 경로 입력은 직접 입력하거나 `선택` 버튼으로 지정할 수 있습니다.

## 사용 방법

1. `새 프로필`을 눌러 실행 환경을 만듭니다.
2. `Profile Name`과 필요한 경로, 옵션을 입력합니다.
3. `Save Profile`로 저장합니다.
4. `설정 확인`으로 Tomcat 설정 파일을 점검합니다.
5. `Run`을 눌러 빌드, 배포, 실행을 시작합니다.

실행 중에는 `Run` 버튼이 `Stop`으로 바뀝니다.  
진행을 멈추려면 `Stop`을 누르면 됩니다.

## 실행 동작

`Run`을 누르면 아래 순서로 진행됩니다.

1. 입력값 확인
2. 기존 배포 파일 정리
3. 프로젝트 빌드
4. WAR 파일 탐색
5. `ROOT.war`로 배포
6. Tomcat 실행

배포는 Tomcat Base 아래 `gtapps\ROOT.war` 기준으로 진행됩니다.

## 로그 확인

- 하단 `상태 및 로그` 영역에서 진행 상황을 확인할 수 있습니다.
- `전체 보기`를 누르면 긴 로그를 크게 볼 수 있습니다.
- 실행 실패 시 마지막 로그 파일이 보관됩니다.

## 배포본 사용 방법

배포본은 설치형이 아니라 ZIP 압축 해제형입니다.

1. 전달받은 ZIP 파일을 원하는 폴더에 압축 해제합니다.
2. 압축 해제된 폴더에서 `tLauncher.exe`를 실행합니다.
3. 필요한 프로필을 만들고 경로를 입력한 뒤 사용합니다.

권장 사항:

- OneDrive, 네트워크 드라이브보다는 로컬 디스크 폴더에 압축을 해제하는 것이 좋습니다.
- 쓰기 권한이 제한된 폴더보다는 사용자 작업 폴더에 두는 것이 안전합니다.

Windows 환경에 따라 SmartScreen 경고가 표시될 수 있습니다.  
사내 배포본임을 확인한 뒤 실행을 계속하면 됩니다.

## 저장 데이터

프로필과 실행 로그는 앱 데이터 폴더에 저장됩니다.

- 개발 실행: `%APPDATA%\tlauncher-dev`
- 배포본 실행: `%APPDATA%\tlauncher`

최근 실행의 로그만 유지되며, 실행용 BAT 파일은 자동으로 정리됩니다.

## 주의 사항

- `Maven Path`는 `mvn.cmd` 파일이어야 합니다.
- `Build Command`에는 `mvn`을 포함하지 않고 인자만 입력합니다.
  - 예: `clean package`
- Tomcat 설정이 `ROOT.war`를 기준으로 되어 있어야 합니다.
- 사용 중인 포트가 이미 점유되어 있으면 Tomcat이 시작되지 않을 수 있습니다.
