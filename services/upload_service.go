// services 业务逻辑层
// upload_service.go 图片上传：落本地磁盘 uploads/<YYYYMM>/<id>.<ext>
// MongoDB 只保存可访问的相对 URL，不存二进制
package services

import (
	"os"
	"path/filepath"
	"strings"
	"time"

	"go-gin/config"
	"go-gin/models"

	"github.com/gin-gonic/gin"
)

// UploadService 上传业务服务
type UploadService struct{}

// NewUploadService 创建上传服务实例
func NewUploadService() *UploadService { return &UploadService{} }

// maxUploadBytes 单文件大小上限 5MB
const maxUploadBytes = 5 << 20

// allowedUploadExts 允许的图片扩展名
var allowedUploadExts = map[string]bool{
	".jpg": true, ".jpeg": true, ".png": true, ".gif": true, ".webp": true, ".svg": true,
}

// UploadRoot 上传文件根目录
var UploadRoot = filepath.Join(".", "uploads")

// UploadPrefix 对外访问前缀，由 gin 静态托管
const UploadPrefix = "/uploads"

// Save 接收 multipart 文件并落盘，同时写素材库记录
func (s *UploadService) Save(c *gin.Context, memberID string) (*models.Upload, error) {
	fileHeader, err := c.FormFile("file")
	if err != nil {
		return nil, ErrBadRequest("请选择要上传的文件")
	}
	if fileHeader.Size <= 0 {
		return nil, ErrBadRequest("文件内容为空")
	}
	if fileHeader.Size > maxUploadBytes {
		return nil, ErrBadRequest("图片需小于 5MB")
	}

	ext := strings.ToLower(filepath.Ext(fileHeader.Filename))
	if !allowedUploadExts[ext] {
		return nil, ErrBadRequest("仅支持 jpg / png / gif / webp / svg 图片")
	}

	id := newID()
	subdir := time.Now().UTC().Format("200601")
	dir := filepath.Join(UploadRoot, subdir)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return nil, err
	}

	dst := filepath.Join(dir, id+ext)
	// filepath.Join 已清理路径，落盘文件名由服务端生成，不受客户端控制
	if err := c.SaveUploadedFile(fileHeader, dst); err != nil {
		return nil, err
	}

	mime := fileHeader.Header.Get("Content-Type")
	if mime == "" {
		mime = mimeByExt(ext)
	}
	upload := &models.Upload{
		ID:        id,
		URL:       UploadPrefix + "/" + subdir + "/" + id + ext,
		Name:      filepath.Base(fileHeader.Filename),
		Size:      fileHeader.Size,
		Mime:      mime,
		MemberID:  memberID,
		CreatedAt: time.Now().UTC(),
	}
	if err := insertDoc(config.Collections.Uploads, upload); err != nil {
		_ = os.Remove(dst)
		return nil, err
	}
	return upload, nil
}

// List 素材库分页
func (s *UploadService) List(page, pageSize int) (*models.PageResult, error) {
	page = clampPage(page)
	pageSize = clampPageSize(pageSize, 24)

	filter := config.M(map[string]interface{}{})
	total, err := countDocs(config.Collections.Uploads, filter)
	if err != nil {
		return nil, err
	}
	var list []models.Upload
	if err := findDocs(config.Collections.Uploads, filter, "created_at", true, pageSize, (page-1)*pageSize, &list); err != nil {
		return nil, err
	}
	if list == nil {
		list = []models.Upload{}
	}
	return &models.PageResult{List: list, Total: total, Page: page, PageSize: pageSize}, nil
}

// Delete 删除素材：先删数据库记录，再删磁盘文件
func (s *UploadService) Delete(id string) error {
	var upload models.Upload
	if err := findOneDoc(config.Collections.Uploads, config.M(map[string]interface{}{"_id": id}), &upload); err != nil {
		return err
	}
	if upload.ID == "" {
		return ErrNotFound("素材不存在")
	}
	if err := deleteDoc(config.Collections.Uploads, id); err != nil {
		return err
	}
	if err := removeUploadedFile(upload.URL); err != nil && !os.IsNotExist(err) {
		return err
	}
	return nil
}

// removeUploadedFile 把 /uploads/xxx 映射为磁盘路径，越界路径直接拒绝
func removeUploadedFile(url string) error {
	rel := strings.TrimPrefix(strings.TrimPrefix(url, UploadPrefix), "/")
	if rel == "" || strings.Contains(rel, "..") {
		return ErrBadRequest("素材地址不合法")
	}
	target := filepath.Join(UploadRoot, filepath.FromSlash(rel))
	cleanRoot := filepath.Clean(UploadRoot)
	if !strings.HasPrefix(filepath.Clean(target), cleanRoot+string(os.PathSeparator)) {
		return ErrBadRequest("素材地址不合法")
	}
	return os.Remove(target)
}

// mimeByExt 按扩展名推断 MIME
func mimeByExt(ext string) string {
	switch ext {
	case ".png":
		return "image/png"
	case ".gif":
		return "image/gif"
	case ".webp":
		return "image/webp"
	case ".svg":
		return "image/svg+xml"
	default:
		return "image/jpeg"
	}
}

// EnsureUploadRoot 启动时确保上传目录存在
func EnsureUploadRoot() error {
	return os.MkdirAll(UploadRoot, 0o755)
}
