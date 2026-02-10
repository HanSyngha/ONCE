/**
 * Mail Service
 *
 * 메일 발송 서비스 (SMTP 또는 외부 API)
 */

const MAIL_API_URL = process.env.MAIL_API_URL || '';
const SERVICE_NAME = 'ONCE';
const BASE_URL = process.env.FRONTEND_URL || 'http://localhost:5090';

interface MailContent {
  subject: string;
  body: string;
}

/**
 * 메일 발송
 */
async function sendMail(
  toEmail: string,
  content: MailContent
): Promise<boolean> {
  if (!MAIL_API_URL) {
    console.log(`[Mail] Mail service not configured. Would send to ${toEmail}: ${content.subject}`);
    return false;
  }

  try {
    const response = await fetch(MAIL_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: toEmail,
        mail_title: content.subject,
        body: content.body,
        contentType: 'text/html',
      }),
    });

    if (!response.ok) {
      console.error(`[Mail] Failed to send email to ${toEmail}:`, await response.text());
      return false;
    }

    console.log(`[Mail] Email sent to ${toEmail}: ${content.subject}`);
    return true;
  } catch (error) {
    console.error(`[Mail] Error sending email to ${toEmail}:`, error);
    return false;
  }
}

/**
 * 사용자 이메일 주소 조회
 * OAuth 기반이므로 loginid가 이메일 형식일 수 있음
 */
function getUserEmail(loginid: string): string {
  // loginid가 이미 이메일 형식이면 그대로 사용
  if (loginid.includes('@')) return loginid;
  // 아니면 빈 문자열 (메일 발송 불가)
  return '';
}

/**
 * 실패 알림 메일 발송
 */
export async function sendFailureEmail(
  loginid: string,
  username: string,
  reason: string,
  details: string,
  retryUrl?: string
): Promise<boolean> {
  const email = getUserEmail(loginid);

  const content: MailContent = {
    subject: `[${SERVICE_NAME}] 요청 처리 실패 알림`,
    body: generateFailureEmailHtml(username, reason, details, retryUrl),
  };

  return sendMail(email, content);
}

/**
 * 히스토리 삭제 예정 알림 메일 발송
 */
export async function sendHistoryExpiryEmail(
  loginid: string,
  username: string,
  fileName: string,
  filePath: string,
  daysUntilExpiry: number,
  fileUrl: string
): Promise<boolean> {
  const email = getUserEmail(loginid);

  const content: MailContent = {
    subject: `[${SERVICE_NAME}] 노트 히스토리 삭제 예정 알림 (${daysUntilExpiry}일 후)`,
    body: generateHistoryExpiryEmailHtml(username, fileName, filePath, daysUntilExpiry, fileUrl),
  };

  return sendMail(email, content);
}

/**
 * 중복 노트 감지 알림 메일 발송
 */
export async function sendDuplicateDetectedEmail(
  loginid: string,
  username: string,
  existingFileName: string,
  existingFilePath: string,
  similarity: number
): Promise<boolean> {
  const email = getUserEmail(loginid);

  const content: MailContent = {
    subject: `[${SERVICE_NAME}] 유사한 노트 감지 알림`,
    body: generateDuplicateEmailHtml(username, existingFileName, existingFilePath, similarity),
  };

  return sendMail(email, content);
}

/**
 * 실패 알림 메일 HTML 생성
 */
function generateFailureEmailHtml(
  username: string,
  reason: string,
  details: string,
  retryUrl?: string
): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body {
      font-family: 'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 600px;
      margin: 0 auto;
      padding: 20px;
    }
    .header {
      background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%);
      color: white;
      padding: 24px;
      border-radius: 12px 12px 0 0;
    }
    .header h1 {
      margin: 0;
      font-size: 20px;
      font-weight: 600;
    }
    .content {
      background: #f9fafb;
      padding: 24px;
      border: 1px solid #e5e7eb;
      border-top: none;
      border-radius: 0 0 12px 12px;
    }
    .alert {
      background: #fef2f2;
      border: 1px solid #fee2e2;
      border-radius: 8px;
      padding: 16px;
      margin-bottom: 20px;
    }
    .alert-title {
      color: #dc2626;
      font-weight: 600;
      margin-bottom: 8px;
    }
    .details {
      background: white;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      padding: 16px;
      margin-bottom: 20px;
    }
    .details-label {
      color: #6b7280;
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: 4px;
    }
    .button {
      display: inline-block;
      background: #3b82f6;
      color: white;
      padding: 12px 24px;
      text-decoration: none;
      border-radius: 8px;
      font-weight: 500;
    }
    .button:hover {
      background: #2563eb;
    }
    .footer {
      margin-top: 24px;
      padding-top: 16px;
      border-top: 1px solid #e5e7eb;
      font-size: 12px;
      color: #6b7280;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>${SERVICE_NAME}</h1>
  </div>
  <div class="content">
    <p>${username}님, 안녕하세요.</p>

    <div class="alert">
      <div class="alert-title">❌ 요청 처리 실패</div>
      <p style="margin: 0; color: #991b1b;">${reason}</p>
    </div>

    <div class="details">
      <div class="details-label">상세 내용</div>
      <p style="margin: 0;">${details}</p>
    </div>

    <div class="details">
      <div class="details-label">발생 시간</div>
      <p style="margin: 0;">${new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}</p>
    </div>

    ${retryUrl ? `
    <p>아래 버튼을 클릭하여 다시 시도해주세요.</p>
    <a href="${retryUrl}" class="button">다시 시도하기</a>
    ` : `
    <p>입력 내용을 줄여서 다시 시도해주세요.</p>
    <a href="${BASE_URL}" class="button">${SERVICE_NAME} 열기</a>
    `}

    <div class="footer">
      <p>이 메일은 ${SERVICE_NAME}에서 자동 발송되었습니다.</p>
      <p>문의: <a href="${BASE_URL}/feedback">피드백 남기기</a></p>
    </div>
  </div>
</body>
</html>
`;
}

/**
 * 히스토리 삭제 예정 알림 메일 HTML 생성
 */
function generateHistoryExpiryEmailHtml(
  username: string,
  fileName: string,
  filePath: string,
  daysUntilExpiry: number,
  fileUrl: string
): string {
  const urgencyClass = daysUntilExpiry <= 1 ? 'alert' : '';
  const urgencyText = daysUntilExpiry <= 1 ? '⚠️ 내일 삭제됩니다!' : '';

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body {
      font-family: 'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 600px;
      margin: 0 auto;
      padding: 20px;
    }
    .header {
      background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%);
      color: white;
      padding: 24px;
      border-radius: 12px 12px 0 0;
    }
    .header h1 {
      margin: 0;
      font-size: 20px;
      font-weight: 600;
    }
    .content {
      background: #f9fafb;
      padding: 24px;
      border: 1px solid #e5e7eb;
      border-top: none;
      border-radius: 0 0 12px 12px;
    }
    .info {
      background: #eff6ff;
      border: 1px solid #bfdbfe;
      border-radius: 8px;
      padding: 16px;
      margin-bottom: 20px;
    }
    .alert {
      background: #fef2f2 !important;
      border-color: #fecaca !important;
    }
    .file-info {
      background: white;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      padding: 16px;
      margin-bottom: 20px;
    }
    .file-name {
      font-weight: 600;
      font-size: 16px;
      margin-bottom: 4px;
    }
    .file-path {
      color: #6b7280;
      font-size: 14px;
    }
    .button {
      display: inline-block;
      background: #3b82f6;
      color: white;
      padding: 12px 24px;
      text-decoration: none;
      border-radius: 8px;
      font-weight: 500;
    }
    .footer {
      margin-top: 24px;
      padding-top: 16px;
      border-top: 1px solid #e5e7eb;
      font-size: 12px;
      color: #6b7280;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>${SERVICE_NAME}</h1>
  </div>
  <div class="content">
    <p>${username}님, 안녕하세요.</p>

    <div class="info ${urgencyClass}">
      <strong>📅 히스토리 삭제 예정 알림</strong>
      <p style="margin: 8px 0 0 0;">
        아래 노트의 히스토리가 <strong>${daysUntilExpiry}일 후</strong> 자동 삭제됩니다.
        ${urgencyText}
      </p>
    </div>

    <div class="file-info">
      <div class="file-name">📄 ${fileName}</div>
      <div class="file-path">${filePath}</div>
    </div>

    <p>히스토리가 필요하시면 삭제 전에 확인해주세요.</p>

    <a href="${fileUrl}" class="button">노트 보기</a>

    <div class="footer">
      <p>이 메일은 ${SERVICE_NAME}에서 자동 발송되었습니다.</p>
      <p>히스토리는 30일간 보관됩니다.</p>
    </div>
  </div>
</body>
</html>
`;
}

/**
 * 중복 노트 감지 알림 메일 HTML 생성
 */
function generateDuplicateEmailHtml(
  username: string,
  existingFileName: string,
  existingFilePath: string,
  similarity: number
): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body {
      font-family: 'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 600px;
      margin: 0 auto;
      padding: 20px;
    }
    .header {
      background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%);
      color: white;
      padding: 24px;
      border-radius: 12px 12px 0 0;
    }
    .header h1 {
      margin: 0;
      font-size: 20px;
      font-weight: 600;
    }
    .content {
      background: #f9fafb;
      padding: 24px;
      border: 1px solid #e5e7eb;
      border-top: none;
      border-radius: 0 0 12px 12px;
    }
    .info {
      background: #fefce8;
      border: 1px solid #fef08a;
      border-radius: 8px;
      padding: 16px;
      margin-bottom: 20px;
    }
    .file-info {
      background: white;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      padding: 16px;
      margin-bottom: 20px;
    }
    .file-name {
      font-weight: 600;
      font-size: 16px;
      margin-bottom: 4px;
    }
    .file-path {
      color: #6b7280;
      font-size: 14px;
    }
    .similarity {
      display: inline-block;
      background: #dcfce7;
      color: #166534;
      padding: 4px 12px;
      border-radius: 12px;
      font-size: 14px;
      font-weight: 500;
      margin-top: 8px;
    }
    .button {
      display: inline-block;
      background: #3b82f6;
      color: white;
      padding: 12px 24px;
      text-decoration: none;
      border-radius: 8px;
      font-weight: 500;
    }
    .footer {
      margin-top: 24px;
      padding-top: 16px;
      border-top: 1px solid #e5e7eb;
      font-size: 12px;
      color: #6b7280;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>${SERVICE_NAME}</h1>
  </div>
  <div class="content">
    <p>${username}님, 안녕하세요.</p>

    <div class="info">
      <strong>🔍 유사한 노트 감지</strong>
      <p style="margin: 8px 0 0 0;">
        방금 입력하신 내용과 유사한 기존 노트가 발견되었습니다.
        AI가 기존 노트에 내용을 추가했습니다.
      </p>
    </div>

    <div class="file-info">
      <div class="file-name">📄 ${existingFileName}</div>
      <div class="file-path">${existingFilePath}</div>
      <div class="similarity">유사도: ${similarity}%</div>
    </div>

    <a href="${BASE_URL}" class="button">노트 확인하기</a>

    <div class="footer">
      <p>이 메일은 ${SERVICE_NAME}에서 자동 발송되었습니다.</p>
    </div>
  </div>
</body>
</html>
`;
}
