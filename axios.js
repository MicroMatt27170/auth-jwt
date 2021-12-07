export default (context, inject) => {
    context.$axios.defaults.headers.post["Content-Type"] = 'application/json'

  context.$axios.interceptors.response.use(res => res, async (error) => {

    if (error.config && error.response && error.response.status === 401) {
      await context.store.dispatch('auth/refresh')
      return context.$axios.request(error.config)
    }

    if (error.response.status === 403) {
      context.store.commit('auth/SET_PAYLOAD', { accessToken: null })
      await context.store.dispatch('auth/redirectToAuthentication')
    }

    return Promise.reject(error)
  });
}