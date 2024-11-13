// グローバル変数、定数、キャッシュ
let page = 1;
const perPage = 30;
const prCache = new Map();

const getCommentsButton = document.getElementById('get-comments');
const commentsDiv = document.getElementById('comments-container');
const noDataDiv = document.getElementById('no-data');
const getMoreButton = document.getElementById('get-more');

// 初期値の設定
document.addEventListener('DOMContentLoaded', () => {
  const monthsAgo = new Date();
  monthsAgo.setMonth(monthsAgo.getMonth() - 3);
  const since = monthsAgo.toISOString().split('T')[0];
  document.getElementById('since').value = since;
});

// 「コメント取得」ボタンのクリックイベント
getCommentsButton.addEventListener('click', (event) => {
  page = 1;
  clearComments();
  fetchComments();
});

// 「さらに取得」ボタンのクリックイベント
getMoreButton.addEventListener('click', () => {
  page++;
  fetchComments();
});

// コメントをクリアする関数
function clearComments() {
  commentsDiv.innerHTML = '';
  commentsDiv.style.display = 'none';
  noDataDiv.style.display = 'none';
  getMoreButton.style.display = 'none';
}

// コメントを取得してレンダリングする関数
async function fetchComments() {
  // フォームの入力値を取得
  const owner = document.getElementById('owner').value.trim();
  const repo = document.getElementById('repo').value.trim();
  const since = document.getElementById('since').value;
  const username = document.getElementById('username').value.trim();
  const excludeSelf = document.getElementById('exclude-self').checked;
  const token = document.getElementById('token').value.trim();

  const url = `https://api.github.com/repos/${owner}/${repo}/pulls/comments` +
    `?since=${toUTCDateTime(since)}&page=${page}&per_page=${perPage}`;

  const headers = {
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    ...(token && { 'Authorization': `Bearer ${token}` })
  };

  enterLoading();
  try {
    // コメント一覧取得API実行
    const response = await fetch(url, { headers });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(`${data.message} [${response.status}]`);
    }

    // 指定されたユーザーのコメントのみをフィルタリング
    const comments = username
      ? data.filter(it => it.user.login === username)
      : data;

    // コメント先のプルリクエストを取得
    await fetchPullRequests(comments, headers);

    // 自己コメントを除外している場合
    const filteredComments = username && excludeSelf
      ? comments.filter(it => prCache.get(it.pull_request_url).author !== username)
      : comments;

    if (filteredComments.length > 0) {
      // HTMLにレンダリングする
      renderComments(filteredComments);
      noDataDiv.textContent = "";
      noDataDiv.style.display = 'none';
    } else {
      // 「該当データなし」を表示
      noDataDiv.textContent = `${page}ページ目: 該当データなし`;
      noDataDiv.style.display = 'block';
    }

    // 「さらに取得」ボタンの表示・非表示を制御
    if (data.length === perPage) {
      getMoreButton.textContent = `さらに取得 (${page + 1}ページ目)`;
      getMoreButton.style.display = 'block';
    } else {
      getMoreButton.style.display = 'none';
    }

  } catch (error) {
    alert(`コメントの取得に失敗しました: ${error.message}`);
  } finally {
    exitLoading();
  }
}

// コメント先のプルリクエストを取得する関数
async function fetchPullRequests(comments, headers) {
  for (const comment of comments) {
    const prUrl = comment.pull_request_url;
    await fetchPullRequest(prUrl, headers);
  }
}

// プルリクエストを取得してキャッシュする関数
async function fetchPullRequest(prUrl, headers) {
  if (prCache.has(prUrl)) return; // 既に取得済みの場合はスキップ

  const response = await fetch(prUrl, { headers });
  const data = await response.json();

  // レスポンスが成功の場合、キャッシュに保存
  if (response.ok) {
    const result = {
      title: data.title,
      author: data.user.login,
      avatarURL: data.user.avatar_url,
      url: data.html_url,
      number: data.number,
    }
    prCache.set(prUrl, result);
  } else {
    if (response.status === 404) {
      // 見つからない（削除された）場合
      const result = { title: "(Not Found)", author: "???", avatarURL: "#", url: "#", number: "???" }
      prCache.set(prUrl, result);
    } else {
      throw new Error(`${data.message} [${response.status}]`);
    }
  }
}

// コメントをHTMLにレンダリングする関数
function renderComments(comments) {
  const newCommentDivs = comments.map(it => createCommentDiv(it));
  commentsDiv.append(...newCommentDivs);
  commentsDiv.style.display = 'block';
}

// コメントデータを表示用のDiv要素に変換する関数
function createCommentDiv(comment) {
  const result = document.createElement('div');
  result.className = 'comment';

  const pr = prCache.get(comment.pull_request_url);
  const filepath = comment.path;
  const diff = comment.diff_hunk.split('\n').slice(1).slice(-5).join('\n');
  const avatarURL = comment.user.avatar_url;
  const url = comment.html_url;
  const date = toJPDate(comment.created_at);
  const text = sanitizeHTML(comment.body);

  result.innerHTML = `
    <div class="comment-header flex-row">
      <!-- ヘッダー部分 -->
      <div>${prIcon}</div>
      <div><b>${pr.title}</b></div>
      <div><a href="${pr.url}" target="_blank">#${pr.number}</a></div>
      <div class="avatar-container">
        <img src="${pr.avatarURL}" class="avatar" alt="avatar" title="${pr.author}">
      </div>
    </div>

    <div class="comment-body">
      <!--コメント本体部分 -->
      <div class="filepath flex-row">
        <div>${fileIcon}</div>
        <div>${filepath}</div>
      </div>
      <div class="diff">${sanitizeHTML(diff)}</div>
      <div class="commenter flex-row">
        <div class="avatar-container">
          <img src="${avatarURL}" class="avatar" alt="avatar">
        </div>
        <div><b>${comment.user.login}</b></div>
        <div><a href="${url}" target="_blank">on ${date}</a></div>
      </div>
      <div class="comment-text">${text}</div>
    </div>
  `.trim();

  return result;
}

const prIcon = `
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="1em" height="1em">
    <!--!Font Awesome Free 6.6.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2024 Fonticons, Inc.-->
    <path d="M305.8 2.1C314.4 5.9 320 14.5 320 24l0 40 16 0c70.7 0 128 57.3 128 128l0 166.7c28.3 12.3 48 40.5 48 73.3c0 44.2-35.8 80-80 80s-80-35.8-80-80c0-32.8 19.7-61 48-73.3L400 192c0-35.3-28.7-64-64-64l-16 0 0 40c0 9.5-5.6 18.1-14.2 21.9s-18.8 2.3-25.8-4.1l-80-72c-5.1-4.6-7.9-11-7.9-17.8s2.9-13.3 7.9-17.8l80-72c7-6.3 17.2-7.9 25.8-4.1zM104 80A24 24 0 1 0 56 80a24 24 0 1 0 48 0zm8 73.3l0 205.3c28.3 12.3 48 40.5 48 73.3c0 44.2-35.8 80-80 80s-80-35.8-80-80c0-32.8 19.7-61 48-73.3l0-205.3C19.7 141 0 112.8 0 80C0 35.8 35.8 0 80 0s80 35.8 80 80c0 32.8-19.7 61-48 73.3zM104 432a24 24 0 1 0 -48 0 24 24 0 1 0 48 0zm328 24a24 24 0 1 0 0-48 24 24 0 1 0 0 48z"/>
  </svg> 
`.trim();

const fileIcon = `
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 384 512" width="1em" height="1em">
    <!--!Font Awesome Free 6.6.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2024 Fonticons, Inc.-->
    <path d="M320 464c8.8 0 16-7.2 16-16l0-288-80 0c-17.7 0-32-14.3-32-32l0-80L64 48c-8.8 0-16 7.2-16 16l0 384c0 8.8 7.2 16 16 16l256 0zM0 64C0 28.7 28.7 0 64 0L229.5 0c17 0 33.3 6.7 45.3 18.7l90.5 90.5c12 12 18.7 28.3 18.7 45.3L384 448c0 35.3-28.7 64-64 64L64 512c-35.3 0-64-28.7-64-64L0 64z"/>
  </svg>
`.trim();

function sanitizeHTML(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function toUTCDateTime(date) {
  return new Date(`${date}T00:00:00`).toISOString();
}

function toJPDate(isoString) {
  return new Date(isoString)
    .toLocaleDateString("ja-JP", { year: "numeric", month: "2-digit", day: "2-digit" });
}

function enterLoading() {
  document.getElementById('loading').style.display = 'block';
  getCommentsButton.disabled = true;
  getMoreButton.disabled = true;
}

function exitLoading() {
  document.getElementById('loading').style.display = 'none';
  getCommentsButton.disabled = false;
  getMoreButton.disabled = false;
}
