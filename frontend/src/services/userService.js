import request from '../utils/request'

export function getUsers(page = 1, pageSize = 10) {
  return request.get('/users', { params: { page, page_size: pageSize } })
}
