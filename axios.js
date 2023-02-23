export default (context, inject) => {
  context.$axios.defaults.headers.post["Content-Type"] = 'application/json'

context.$axios.interceptors.response.use(res => res, async (error) => {

  if (error.config && error.response && error.response.status === 401) {
    await context.store.dispatch('auth/refresh')

    error.config.headers.Authorization = 'Bearer ' + context.store.state.auth.accessToken
    return context.$axios.request(error.config)
  }

  if (error.config && error.response && error.response.status === 403) {
    context.store.commit('auth/SET_PAYLOAD', { accessToken: null })
    await context.store.dispatch('auth/redirectToAuthentication')
  }

  // if (error.isAxiosError && error.message === "Network Error") {
  //   context.store.commit('auth/SET_PAYLOAD', { accessToken: null })
  //   await context.store.dispatch('auth/redirectToAuthentication')
  // }

  return Promise.reject(error)
});
}
