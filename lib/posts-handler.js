'use strict';
const crypto = require('crypto');    // ハッシュ関数など、様々な暗号化にのための関数が入っている
const pug = require('pug');    // テンプレートエンジンのpugをインポート
const Cookies = require('cookies');    // cookieをインポート
const moment = require('moment-timezone');    // 時間を扱うモジュールをインポート（現在時刻の表記方法等を変えられる）

const util = require('./handler-util');
const Post = require('./post');

const trackingIdKey = 'tracking_id';    // tracking_idというkeyを設定

/**
 * ルーティングを行う
 * @param {object} req 
 * @param {object} res 
 */
function handle(req, res) {
  const cookies = new Cookies(req, res);    // Cookieモジュールから新たにcookieオブジェクトを作成
  const trackingId = addTrackingCookie(cookies, req.user);    // trackingIdを設定

  switch (req.method) {
    case 'GET':
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8'
      });
      Post.findAll({ order: [['id', 'DESC']] }).then((posts) => {
        posts.forEach((post) => {
          post.content = post.content.replace(/\+/g, ' ');
          post.formattedCreatedAt = moment(post.createdAt).tz('Asia/Tokyo').format('YYYY年MM月DD日 HH時mm分ss秒');
        });
        res.end(pug.renderFile('./views/posts.pug', {    // postとしてpugをレンダリングして返す（pugに変数 posts/user を渡す）
          posts: posts,
          user: req.user
        }));
        console.info(
          `閲覧されました: user: ${req.user}, ` +
          `trackingId: ${trackingId},` +
          `remoteAddress: ${req.connection.remoteAddress}, ` +
          `userAgent: ${req.headers['user-agent']} `
        );
      });
      break;
    case 'POST':
      let body = [];
      req.on('data', (chunk) => {
        body.push(chunk);
      }).on('end', () => {
        body = Buffer.concat(body).toString();
        const decoded = decodeURIComponent(body);
        const content = decoded.split('content=')[1];
        console.info('投稿されました: ' + content);
        Post.create({
          content: content,
          trackingCookie: trackingId,
          postedBy: req.user
        }).then(() => {
          handleRedirectPosts(req, res);
        });
      });
      break;
    default:
      util.handleBadRequest(req, res);
      break;
  }
}

function handleDelete(req, res) {
  switch (req.method) {
    case 'POST':
      let body = [];
      req.on('data', (chunk) => {
        body.push(chunk);
      }).on('end', () => {
        body = Buffer.concat(body).toString();
        const decoded = decodeURIComponent(body);
        const id = decoded.split('id=')[1];
        Post.findByPk(id).then((post) => {
          if (req.user === post.postedBy || req.user === 'admin') {
            post.destroy().then(() => {
              console.info(
                `削除されました: user: ${req.user}, ` +
                `remoteAddress: ${req.connection.remoteAddress}, ` +
                `userAgent: ${req.headers['user-agent']} `
              );
              handleRedirectPosts(req, res);
            });
          }
        });
      });
      break;
    default:
      util.handleBadRequest(req, res);
      break;
  }
}

/**
 * Cookieに含まれているトラッキングIDに異常がなければその値を返却
 * 存在しない場合や、異常なものである場合には、再度作成し、Cookieに付与してその値を返す
 * @param {Cookies} cookies 
 * @param {String} userName
 * @return {String} trackingId
 */
function addTrackingCookie(cookies, userName) {
  const requestedTrackingId = cookies.get(trackingIdKey)    // 開発者ウィンドウに出てくる cookie のValueを取得（tracking_id と書かれた部分の値のこと）
  if (isValidTrackingId(requestedTrackingId, userName)) {    // request された trackingIdが正常であれば そのまま trackingIdを返却
    return requestedTrackingId;    
  } else {    // trackngIdが正常でない、もしくは空であった場合
    const originalId = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);    // Math関数を用いてランダムに数字を生成してoriginalIdとして付与
    const tomorrow = new Date(Date.now() * (1000 * 60 * 60 * 24));    // 明日の日付を取得
    const trackingId = originalId + '_' + createValidHash(originalId, userName);    // userIdとハッシュ値（trackingIdとuserNameを足したハッシュ）を合成したものを取得
    cookies.set(trackingIdKey, trackingId, {expires: tomorrow});    // クッキーに trackingIdKey: trackingId と期限を設定
    return trackingId;
  };
};

/**
 * IDとハッシュ化させたものを分割させる
 * @param {String} trackingId 
 * @param {String} userName
 * @return {Boolean}  
 */
function isValidTrackingId(trackingId, userName) {
  if (!trackingId) {    // trackingIdが不正,もしくは空であれば false を返して処理終了
    return false;
  };
  const splitted = trackingId.split('_');    // trackingIdを _ を元にして分割させる（ _ 以前  と  _以後  の二つに分割）
  const originalId = splitted[0];
  const requestedHash = splitted[1];
  return createValidHash(originalId, userName) === requestedHash;   // 作成したハッシュ値が送られてきたハッシュ値と同じかどうかを検証
};

/**
 * ハッシュ値を作成する
 * @param {String} originalId 
 * @param {String} userName 
 */
function createValidHash(originalId, userName) {
  const sha1sum = crypto.createHash('sha1');    // SHA-1をオブジェクトとして取得
  sha1sum.update(originalId + userName);    // SHA-1アルゴリズムを用いて、元々のtrackingIdとuserNameを結合した文字列のメッセージダイジェストを取得
  return sha1sum.digest('hex');    // 16進数の文字列として取得する場合、hexを引数として指定する
};


function handleRedirectPosts(req, res) {
  res.writeHead(303, {
    'Location': '/posts'
  });
  res.end();
}

module.exports = {
  handle,
  handleDelete
};
