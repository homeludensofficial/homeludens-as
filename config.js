// Supabase 대시보드 → Project Settings → API Keys 의 Project URL / anon 키
// anon 키는 웹페이지에 공개돼도 되는 키입니다. 데이터는 DB 권한 규칙(회사 이메일만)으로 보호됩니다.
// service_role 키는 절대 여기에 넣지 마세요.
window.CLAIM_APP_CONFIG = {
  supabaseUrl: 'https://iuvnkgytpbxlsuyggocz.supabase.co',
  supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml1dm5rZ3l0cGJ4bHN1eWdnb2N6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE5MzkxMzIsImV4cCI6MjEwNzUxNTEzMn0.Bu5BYlaTdZdsVF1QHleLNKk2pUE8CGE5dbG8P1mwfSI',
  // 로그인 허용은 업무지원포털 '직원' 시트(재직)로 판단합니다. 도메인 제한 없음.
  allowedEmailDomain: ''
};
