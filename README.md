# 면스방

서류 합격 후 같은 회사 면접을 앞둔 사람끼리 면접 스터디를 모집하고 신청하는 사이트입니다.

- 주소: https://myeonsbang.vercel.app
- 같은 직무끼리 / 다른 직무끼리 / 직무 무관 중에서 모집 조건을 고르고, 바로 참가 또는 방장 수락 방식으로 받습니다.
- 가입 없이 닉네임만 씁니다. 실명·전화번호·이메일·학교는 받지 않습니다.

## 파일

- `index.html`: 사이트 전체 (화면, 규칙, Firebase 연결이 한 파일에 들어 있음)
- `firestore.rules`: Firestore 보안 규칙. 바꾸면 Firebase 콘솔 → Firestore → 규칙에 붙여 넣고 게시합니다.
- `og.png`: 카카오톡 등에 링크를 붙였을 때 보이는 미리보기 이미지

## 구성

- Firebase 프로젝트 `myeonsbang` (Spark 무료 요금제): Firestore(서울, asia-northeast3), 익명 로그인
- Vercel: 이 저장소의 main 브랜치에 올리면 자동으로 다시 배포됩니다.
- `index.html` 안의 Firebase 설정값은 어느 프로젝트인지 알려 주는 공개 주소라 저장소에 있어도 됩니다. 데이터는 보안 규칙이 지킵니다.

## 디자인

- 색·모양: 흰 바탕에 코랄 한 가지만 포인트로 쓰는 Airbnb 느낌 ([awesome-design-md](https://github.com/VoltAgent/awesome-design-md)의 Airbnb DESIGN.md 참고, 로고·이름은 쓰지 않음)
- 규칙: [taste-skill](https://github.com/Leonxlnx/taste-skill) (MIT) 중 앱에 맞는 것만 적용: 버튼·카드·링크 모양 한 벌, 누를 곳 44px 이상, 본문 대비 7:1, 기울인 것 없음, 보라색 없음, 버튼은 누르면 눌리고 카드는 올리면 2px 뜸
- 글꼴: Pretendard (jsDelivr)
