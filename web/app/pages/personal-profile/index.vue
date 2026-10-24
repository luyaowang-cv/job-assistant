<script setup lang="ts">
import { ElMessage } from 'element-plus'

type Basics = {
  fullName: string, countryRegion: string, gender: string, email: string, birthDate: string, wechatId: string, targetCities: string[], documentType: string, documentNumber: string,
  phone: string, politicalStatus: string, city: string, ethnicity: string, nativePlace: string, householdLocation: string, heightCm: number | undefined, weightKg: number | undefined,
  maritalStatus: string, emergencyContactName: string, emergencyContactRelation: string, emergencyContactPhone: string,
}

const empty = () => ({
  basics: {
    fullName: '', countryRegion: '中国', gender: '', email: '', birthDate: '', wechatId: '', targetCities: [], documentType: '居民身份证', documentNumber: '', phone: '', politicalStatus: '', city: '',
    ethnicity: '', nativePlace: '', householdLocation: '', heightCm: undefined, weightKg: undefined, maritalStatus: '', emergencyContactName: '', emergencyContactRelation: '', emergencyContactPhone: '',
  } as Basics,
})
const profile = reactive(empty())
const loading = ref(false)
const saving = ref(false)

function assign(data?: Partial<ReturnType<typeof empty>>) {
  // Keep Vue's reactive nested object stable. Replacing profile.basics during a
  // reload can leave inputs bound to the previous proxy and appear blank.
  Object.assign(profile.basics, empty().basics, data?.basics ?? {})
}
const cleanEntry = (entry: Record<string, unknown>) => Object.fromEntries(Object.entries(entry).filter(([, value]) => {
  if (typeof value === 'string') return Boolean(value.trim())
  return typeof value === 'number' && Number.isFinite(value)
}))
function payload() {
  const { targetCities, ...textBasics } = profile.basics
  // 不带 educations：教育已迁成素材卡，服务端收到缺省字段时不会覆盖库里的历史值
  return {
    basics: {
      ...cleanEntry(textBasics),
      ...(targetCities.map(value => value.trim()).filter(Boolean).length ? { targetCities: targetCities.map(value => value.trim()).filter(Boolean) } : {}),
    },
  }
}
async function load() {
  loading.value = true
  try { const response = await $fetch<{ data: Partial<ReturnType<typeof empty>> | null }>('/api/v1/personal-profile'); assign(response.data ?? undefined) }
  catch { ElMessage.error('个人主档案读取失败。') }
  finally { loading.value = false }
}
async function save() {
  saving.value = true
  try { await $fetch('/api/v1/personal-profile', { method: 'PUT', body: payload() }); ElMessage.success('个人主档案已保存；网申档案会自动继承这些固定信息。') }
  catch { ElMessage.error('保存失败，请检查邮箱、手机号和日期格式。') }
  finally { saving.value = false }
}
onMounted(() => { void load() })
</script>

<template>
  <section v-loading="loading" class="page-rail page-rail--narrow material-page pb-24">
    <div class="material-surface material-surface--transparent">
      <div class="material-section-label mb-5 mt-2 text-sm text-slate-500">个人信息</div>
      <div class="profile-form-grid personal-profile-fields">
        <el-form-item label="姓名"><el-input v-model="profile.basics.fullName" /></el-form-item>
        <el-form-item label="性别"><el-input v-model="profile.basics.gender" /></el-form-item>
        <el-form-item label="出生日期"><el-input v-model="profile.basics.birthDate" placeholder="YYYY-MM-DD" /></el-form-item>
        <el-form-item label="国籍/地区"><el-input v-model="profile.basics.countryRegion" /></el-form-item>
        <el-form-item label="民族"><el-input v-model="profile.basics.ethnicity" /></el-form-item>
        <el-form-item label="政治面貌"><el-input v-model="profile.basics.politicalStatus" /></el-form-item>
        <el-form-item label="籍贯"><el-input v-model="profile.basics.nativePlace" placeholder="精确到市" /></el-form-item>
        <el-form-item label="户口所在地"><el-input v-model="profile.basics.householdLocation" placeholder="精确到市" /></el-form-item>
        <el-form-item label="身高（cm）"><el-input-number v-model="profile.basics.heightCm" class="w-full" :min="30" :max="300" controls-position="right" /></el-form-item>
        <el-form-item label="体重（kg）"><el-input-number v-model="profile.basics.weightKg" class="w-full" :min="1" :max="500" :precision="1" controls-position="right" /></el-form-item>
        <el-form-item label="婚姻状况"><el-input v-model="profile.basics.maritalStatus" placeholder="未婚 / 已婚" /></el-form-item>
        <el-form-item label="所在地"><el-input v-model="profile.basics.city" /></el-form-item>
        <el-form-item label="移动电话"><el-input v-model="profile.basics.phone" /></el-form-item>
        <el-form-item label="电子邮箱"><el-input v-model="profile.basics.email" /></el-form-item>
        <el-form-item label="微信号"><el-input v-model="profile.basics.wechatId" /></el-form-item>
        <el-form-item label="证件类型"><el-input v-model="profile.basics.documentType" /></el-form-item>
        <el-form-item class="profile-form-item--wide" label="证件号码"><el-input v-model="profile.basics.documentNumber" type="password" show-password placeholder="仅在本地保存；明确匹配的官网字段可本地自动填充，不会发送给 AI" /></el-form-item>
        <el-form-item class="profile-form-item--wide" label="默认期望工作地点"><el-select v-model="profile.basics.targetCities" class="w-full" multiple filterable allow-create default-first-option /></el-form-item>
        <el-form-item label="紧急联系人姓名"><el-input v-model="profile.basics.emergencyContactName" /></el-form-item>
        <el-form-item label="紧急联系人关系"><el-input v-model="profile.basics.emergencyContactRelation" /></el-form-item>
        <el-form-item class="profile-form-item--wide" label="紧急联系人电话"><el-input v-model="profile.basics.emergencyContactPhone" /></el-form-item>
      </div>
      <div class="personal-profile__save"><el-button type="primary" size="large" :loading="saving" @click="save">保存个人主档案</el-button></div>
    </div>
  </section>
</template>
