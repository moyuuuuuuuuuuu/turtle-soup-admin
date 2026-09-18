<template>
  <div class="page-content">
    <ElCard shadow="never">
      <div class="mb-4 flex gap-3">
        <ElInput
          v-model="query.keyword"
          clearable
          placeholder="站点名称 / 地址"
          class="w-60"
          @keyup.enter="handleSearch"
        />
        <ElSelect v-model="query.status" clearable placeholder="状态" class="w-36">
          <ElOption label="显示" :value="true" />
          <ElOption label="隐藏" :value="false" />
        </ElSelect>
        <ElButton type="primary" @click="handleSearch">查询</ElButton>
        <ElButton v-permission="'friend_link:create'" @click="open()">新增友链</ElButton>
      </div>

      <ElTable :data="rows" v-loading="loading">
        <ElTableColumn prop="name" label="站点名称" min-width="140" />
        <ElTableColumn label="站点地址" min-width="220">
          <template #default="{ row }">
            <a :href="row.url" target="_blank" rel="noopener noreferrer" class="text-primary">
              {{ row.url }}
            </a>
          </template>
        </ElTableColumn>
        <ElTableColumn label="Logo" width="100">
          <template #default="{ row }">
            <img
              v-if="row.logo_url"
              :src="row.logo_url"
              class="h-8 max-w-16 object-contain"
              :alt="row.name"
            />
          </template>
        </ElTableColumn>
        <ElTableColumn prop="description" label="简介" min-width="160" show-overflow-tooltip />
        <ElTableColumn
          prop="reciprocal_url"
          label="回链地址"
          min-width="180"
          show-overflow-tooltip
        />
        <ElTableColumn prop="contact_email" label="联系邮箱" min-width="160" />
        <ElTableColumn label="状态" width="80">
          <template #default="{ row }">
            <ElTag :type="row.status ? 'success' : 'info'">
              {{ row.status ? '显示' : '隐藏' }}
            </ElTag>
          </template>
        </ElTableColumn>
        <ElTableColumn prop="sort" label="排序" width="80" />
        <ElTableColumn label="操作" width="140" fixed="right">
          <template #default="{ row }">
            <ElButton v-permission="'friend_link:update'" link @click="open(row)"> 编辑 </ElButton>
            <ElButton v-permission="'friend_link:delete'" link type="danger" @click="remove(row)">
              删除
            </ElButton>
          </template>
        </ElTableColumn>
      </ElTable>

      <ElPagination
        class="mt-4 justify-end"
        layout="total, prev, pager, next"
        :total="total"
        :page-size="query.pageSize"
        :current-page="query.page"
        @current-change="handlePageChange"
      />
    </ElCard>

    <ElDialog
      v-model="editVisible"
      :title="form.id ? '编辑友链' : '新增友链'"
      width="560px"
      destroy-on-close
    >
      <ElForm ref="formRef" :model="form" :rules="rules" label-width="100px">
        <ElFormItem label="站点名称" prop="name">
          <ElInput v-model="form.name" maxlength="80" show-word-limit placeholder="必填" />
        </ElFormItem>
        <ElFormItem label="站点地址" prop="url">
          <ElInput v-model="form.url" placeholder="https:// 必填" />
        </ElFormItem>
        <ElFormItem label="Logo" prop="logo_url">
          <ElInput v-model="form.logo_url" placeholder="https:// 选填" />
        </ElFormItem>
        <ElFormItem label="一句话简介" prop="description">
          <ElInput
            v-model="form.description"
            type="textarea"
            :rows="3"
            maxlength="255"
            show-word-limit
            placeholder="选填"
          />
        </ElFormItem>
        <ElFormItem label="回链地址" prop="reciprocal_url">
          <ElInput v-model="form.reciprocal_url" placeholder="对方站点上的回链，仅管理员核对用" />
        </ElFormItem>
        <ElFormItem label="联系邮箱" prop="contact_email">
          <ElInput v-model="form.contact_email" placeholder="选填" />
        </ElFormItem>
        <ElFormItem label="前台显示">
          <ElSwitch v-model="form.status" />
        </ElFormItem>
        <ElFormItem label="排序">
          <ElInputNumber v-model="form.sort" :min="0" />
        </ElFormItem>
      </ElForm>
      <template #footer>
        <ElButton @click="editVisible = false">取消</ElButton>
        <ElButton type="primary" :loading="saving" @click="save">保存</ElButton>
      </template>
    </ElDialog>
  </div>
</template>

<script setup lang="ts">
  import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus'
  import { friendLinkAdminApi, type FriendLinkForm, type FriendLinkRow } from '@/api/operations'

  const rows = ref<FriendLinkRow[]>([])
  const total = ref(0)
  const loading = ref(false)
  const saving = ref(false)
  const editVisible = ref(false)
  const formRef = ref<FormInstance>()

  const query = reactive({
    keyword: '',
    status: undefined as boolean | undefined,
    page: 1,
    pageSize: 20
  })

  const emptyForm = (): FriendLinkForm => ({
    name: '',
    url: '',
    logo_url: '',
    description: '',
    reciprocal_url: '',
    contact_email: '',
    status: true,
    sort: 0
  })

  const form = reactive<FriendLinkForm>(emptyForm())

  const isHttpUrl = (value: string) => !value || /^https?:\/\/.+/i.test(value)

  const rules: FormRules = {
    name: [
      { required: true, message: '请输入站点名称', trigger: 'blur' },
      { max: 80, message: '站点名称不能超过 80 字', trigger: 'blur' }
    ],
    url: [
      { required: true, message: '请输入站点地址', trigger: 'blur' },
      { max: 500, message: '站点地址不能超过 500 字', trigger: 'blur' },
      {
        validator: (_rule, value, callback) => {
          const v = String(value || '')
          if (!v) {
            callback(new Error('请输入站点地址'))
            return
          }
          callback(isHttpUrl(v) ? undefined : new Error('必须是 http/https 地址'))
        },
        trigger: 'blur'
      }
    ],
    logo_url: [
      {
        validator: (_rule, value, callback) => {
          callback(
            isHttpUrl(String(value || '')) ? undefined : new Error('Logo 地址必须是 http/https')
          )
        },
        trigger: 'blur'
      }
    ],
    reciprocal_url: [
      {
        validator: (_rule, value, callback) => {
          callback(
            isHttpUrl(String(value || '')) ? undefined : new Error('回链地址必须是 http/https')
          )
        },
        trigger: 'blur'
      }
    ],
    contact_email: [
      {
        validator: (_rule, value, callback) => {
          const v = String(value || '')
          callback(
            !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? undefined : new Error('联系邮箱格式不正确')
          )
        },
        trigger: 'blur'
      }
    ],
    description: [{ max: 255, message: '简介不能超过 255 字', trigger: 'blur' }]
  }

  async function load() {
    loading.value = true
    try {
      const params: Record<string, unknown> = {
        keyword: query.keyword,
        page: query.page,
        pageSize: query.pageSize
      }
      if (query.status !== undefined) {
        params.status = query.status
      }
      const data = await friendLinkAdminApi.list(params)
      rows.value = data.items
      total.value = data.total
    } finally {
      loading.value = false
    }
  }

  function handleSearch() {
    query.page = 1
    load()
  }

  function handlePageChange(page: number) {
    query.page = page
    load()
  }

  function open(row?: FriendLinkRow) {
    Object.assign(
      form,
      emptyForm(),
      row
        ? {
            id: row.id,
            name: row.name,
            url: row.url,
            logo_url: row.logo_url || '',
            description: row.description || '',
            reciprocal_url: row.reciprocal_url || '',
            contact_email: row.contact_email || '',
            status: row.status,
            sort: row.sort
          }
        : {}
    )
    editVisible.value = true
  }

  async function save() {
    if (!formRef.value) return
    try {
      await formRef.value.validate()
    } catch {
      return
    }
    saving.value = true
    try {
      const payload: FriendLinkForm = {
        name: form.name.trim(),
        url: form.url.trim(),
        logo_url: form.logo_url?.trim() || '',
        description: form.description?.trim() || '',
        reciprocal_url: form.reciprocal_url?.trim() || '',
        contact_email: form.contact_email?.trim() || '',
        status: form.status,
        sort: form.sort
      }
      if (form.id) {
        await friendLinkAdminApi.update({ ...payload, id: form.id })
      } else {
        await friendLinkAdminApi.save(payload)
      }
      editVisible.value = false
      ElMessage.success('保存成功')
      await load()
    } finally {
      saving.value = false
    }
  }

  async function remove(row: FriendLinkRow) {
    await ElMessageBox.confirm(`确定删除友链「${row.name}」？`, '提示', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消'
    })
    await friendLinkAdminApi.destroy([row.id])
    ElMessage.success('删除成功')
    await load()
  }

  onMounted(load)
</script>
