const express = require('express')
const multer = require('multer')
const cors = require('cors')
const fs = require('fs')
const path = require('path')

const app = express()
app.use(cors())
app.use(express.json())

const DB_FILE = path.join(__dirname, 'db.json')

// Tạo thư mục nếu chưa có
const ensureDir = (dir) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

// Đọc / Ghi DB
const readDB = () => {
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'))
  } catch {
    return { users: [], posts: [], comments: [] }
  }
}
const writeDB = (data) => fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf-8')

// ========== USERS ==========
app.get('/users', (req, res) => {
  const db = readDB()
  const { username } = req.query
  const users = db.users || []
  if (username) {
    return res.json(users.filter(u => u.username === username))
  }
  res.json(users)
})

app.post('/users', (req, res) => {
  try {
    const db = readDB()
    const users = db.users || []
    const newUser = req.body
    newUser.id = Date.now()
    if (!newUser.role) newUser.role = 'user'
    users.push(newUser)
    db.users = users
    writeDB(db)
    res.status(201).json(newUser)
  } catch {
    res.status(500).json({ error: 'Không thể tạo user' })
  }
})

// ========== POSTS ==========
app.get('/posts', (req, res) => {
  const db = readDB()
  res.json(db.posts || [])
})

// ✅ Route mới để lấy 1 bài viết theo ID
app.get('/posts/:id', (req, res) => {
  const db = readDB()
  const postId = parseInt(req.params.id)
  const post = db.posts?.find(p => p.id === postId)
  if (!post) return res.status(404).json({ error: 'Post not found' })
  res.json(post)
})

app.post('/posts', (req, res) => {
  const db = readDB()
  const posts = db.posts || []
  const newPost = { 
    ...req.body, 
    id: Date.now(),
    createdAt: new Date().toISOString()
  }
  posts.push(newPost)
  db.posts = posts
  writeDB(db)
  res.status(201).json(newPost)
})

app.put('/posts/:id', (req, res) => {
  const db = readDB()
  const posts = db.posts || []
  const id = parseInt(req.params.id)
  const index = posts.findIndex(p => p.id === id)
  if (index === -1) return res.status(404).json({ error: 'Not found' })
  
  // Bảo vệ trường createdAt khỏi bị ghi đè
  const { createdAt, ...updateData } = req.body
  posts[index] = { ...posts[index], ...updateData }
  
  db.posts = posts
  writeDB(db)
  res.json(posts[index])
})

app.delete('/posts/:id', (req, res) => {
  const db = readDB()
  const posts = db.posts || []
  const id = parseInt(req.params.id)
  const { username } = req.body
  const user = (db.users || []).find(u => u.username === username)
  const post = posts.find(p => p.id === id)
  if (!post) return res.status(404).json({ error: 'Not found' })
  if (!user) return res.status(401).json({ error: 'Chưa đăng nhập' })
  if (user.role !== 'admin' && post.author !== username) {
    return res.status(403).json({ error: 'Bạn không có quyền xóa bài đăng này' })
  }
  db.posts = posts.filter(p => p.id !== id)
  writeDB(db)
  res.status(204).end()
})

// ========== COMMENTS ==========
app.get('/comments', (req, res) => {
  const db = readDB()
  const { postId } = req.query
  const comments = db.comments || []
  
  if (postId) {
    // Lấy tất cả comments cho post này
    const postComments = comments.filter(c => c.postId == postId)
    
    // Tạo cấu trúc phân cấp
    const buildCommentTree = (parentId = null) => {
      return postComments
        .filter(comment => {
          // So sánh chính xác parentId với kiểu dữ liệu
          if (parentId === null) {
            return comment.parentId === null || comment.parentId === undefined
          } else {
            return comment.parentId == parentId // Sử dụng == để so sánh string và number
          }
        })
        .map(comment => ({
          ...comment,
          replies: buildCommentTree(comment.id)
        }))
    }
    
    const commentTree = buildCommentTree()
    return res.json(commentTree)
  }
  res.json(comments)
})

// Thêm bình luận mới
app.post('/comments', (req, res) => {
  try {
    const db = readDB();
    const comments = db.comments || [];
    const newComment = { 
      ...req.body, 
      id: Date.now(),
      parentId: req.body.parentId || null,
      replies: []
    };
    comments.push(newComment);
    db.comments = comments;
    writeDB(db);
    res.status(201).json(newComment);
  } catch {
    res.status(500).json({ error: 'Không thể thêm bình luận' });
  }
});

// ========== UPLOAD ==========
const imageStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = 'public/uploads/images'
    ensureDir(dir)
    cb(null, dir)
  },
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
})

const videoStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = 'public/uploads/videos'
    ensureDir(dir)
    cb(null, dir)
  },
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
})

const uploadImage = multer({ storage: imageStorage })
const uploadVideo = multer({ storage: videoStorage })

app.post('/upload/image', uploadImage.single('file'), (req, res) => {
  res.json({ filePath: `/uploads/images/${req.file.filename}` })
})

app.post('/upload/video', uploadVideo.single('file'), (req, res) => {
  res.json({ filePath: `/uploads/videos/${req.file.filename}` })
})

// ========== STATIC FILE SERVING ==========
app.use(express.static('public'))

// ========== START SERVER ==========
app.listen(3001, () => {
  console.log('✅ Server đang chạy tại http://localhost:3001')
})

// API like/dislike theo user
app.put('/posts/:id/like', (req, res) => {
  const db = readDB();
  const posts = db.posts || [];
  const id = parseInt(req.params.id);
  const { username, action } = req.body; // action: 'like', 'dislike', 'unlike', 'undislike'
  const post = posts.find(p => p.id === id);
  if (!post) return res.status(404).json({ error: 'Not found' });

  // Đảm bảo mảng tồn tại
  post.userLiked = post.userLiked || [];
  post.userDisliked = post.userDisliked || [];
  post.likes = post.likes || 0;
  post.dislikes = post.dislikes || 0;

  // Xử lý logic like/dislike
  if (action === 'like') {
    if (!post.userLiked.includes(username)) {
      post.userLiked.push(username);
      post.likes++;
      // Nếu user đang dislike thì bỏ dislike
      const idx = post.userDisliked.indexOf(username);
      if (idx !== -1) {
        post.userDisliked.splice(idx, 1);
        post.dislikes--;
      }
    } else {
      // Nếu đã like rồi thì không tăng like nữa
      return res.json({ likes: post.likes, dislikes: post.dislikes, userLiked: post.userLiked, userDisliked: post.userDisliked, message: 'Bạn đã like bài viết này!' });
    }
  } else if (action === 'dislike') {
    if (!post.userDisliked.includes(username)) {
      post.userDisliked.push(username);
      post.dislikes++;
      // Nếu user đang like thì bỏ like
      const idx = post.userLiked.indexOf(username);
      if (idx !== -1) {
        post.userLiked.splice(idx, 1);
        post.likes--;
      }
    }
  } else if (action === 'unlike') {
    const idx = post.userLiked.indexOf(username);
    if (idx !== -1) {
      post.userLiked.splice(idx, 1);
      post.likes--;
    }
  } else if (action === 'undislike') {
    const idx = post.userDisliked.indexOf(username);
    if (idx !== -1) {
      post.userDisliked.splice(idx, 1);
      post.dislikes--;
    }
  }

  writeDB(db);
  res.json({ likes: post.likes, dislikes: post.dislikes, userLiked: post.userLiked, userDisliked: post.userDisliked });
});

// Sửa route đăng nhập (giả sử POST /users/login)
app.post('/users/login', (req, res) => {
  const db = readDB();
  const { username, password } = req.body;
  const user = (db.users || []).find(u => u.username === username && u.password === password);
  if (!user) return res.status(401).json({ error: 'Sai tài khoản hoặc mật khẩu' });
  // Trả về cả role
  res.json({ username: user.username, email: user.email, role: user.role || 'user' });
});

// API cập nhật role user
app.put('/users/:id', (req, res) => {
  const db = readDB();
  const users = db.users || [];
  const id = parseInt(req.params.id);
  const index = users.findIndex(u => u.id === id);
  if (index === -1) return res.status(404).json({ error: 'User not found' });
  users[index] = { ...users[index], ...req.body };
  db.users = users;
  writeDB(db);
  res.json(users[index]);
});

// Thêm API xoá comment và replies con
app.delete('/comments/:id', (req, res) => {
  try {
    const db = readDB();
    let comments = db.comments || [];
    const commentId = parseInt(req.params.id);

    // Tìm comment để xoá
    const commentToDelete = comments.find(c => c.id === commentId);
    if (!commentToDelete) return res.status(404).json({ error: 'Comment not found' });

    // Đệ quy để xoá replies con
    const deleteWithChildren = (id) => {
      const children = comments.filter(c => c.parentId === id);
      for (const child of children) {
        deleteWithChildren(child.id);
      }
      comments = comments.filter(c => c.id !== id);
    }

    deleteWithChildren(commentId);

    db.comments = comments;
    writeDB(db);
    res.status(204).end();
  } catch {
    res.status(500).json({ error: 'Không thể xoá comment' });
  }
});
