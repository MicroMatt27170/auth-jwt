
// store/auth.js
export var service = 'account'

// reusable aliases for mutations
export const AUTH_MUTATIONS = {
  SET_USER: 'SET_USER',
  SET_PAYLOAD: 'SET_PAYLOAD',
  LOGOUT: 'LOGOUT',
}

export const state = () => ({
  accessToken: null, // JWT access token
  token: {
    createdAt: null,
    expirationAt: null,
  },
  user: {
    uuid: null,
    username: '',
    name: ''
  },
  actions: []
})

export const getters = {
  // determine if the user is authenticated based on the presence of the access token
  isAuthenticated: (state) => {
    return state.accessToken && state.accessToken !== ''
  },
}


export const mutations = {
  // store the logged in user in the state
  [AUTH_MUTATIONS.SET_USER] (state, { user }) {
    state.user = user
  },

  // store new or updated token fields in the state
  [AUTH_MUTATIONS.SET_PAYLOAD] (state, {
    accessToken,
    createdAt = null,
    expirationAt = null,
    actions = [] }) {
    state.accessToken = accessToken
    state.actions = actions

    if (createdAt) {
      try {
        state.token.createdAt = new Date(createdAt * 1000)
        state.token.expirationAt = new Date(expirationAt * 1000)
      } catch (e) {
        state.token.createdAt = null
        state.token.expirationAt = null
      }
    }

    if (accessToken) {
      localStorage.setItem('jwt', accessToken)
      this.$axios.defaults.headers.common.Authorization = 'Bearer ' + accessToken
    } else {
      localStorage.removeItem('jwt')
      delete this.$axios.defaults.headers.common.Authorization
    }
  },

  // clear our the state, essentially logging out the user
  [AUTH_MUTATIONS.LOGOUT] (state) {
    state.id = null
    state.username = null
    state.accessToken = null
    state.refreshToken = null
  },
}



function isValidToken(token) {
  
  try {
    const jwt = token.split('.')
    if (jwt.length !== 3) return false;

    JSON.parse(atob(jwt[0]))
    JSON.parse(atob(jwt[1]))


    localStorage.setItem('jwt', token)
    return true;
  }catch (e) {
    return false;
  }
}

function redirectToAuth(redirect) {
  const localUrl = window.location.href
  const urlSearchParams = {
    continueTo: localUrl,
    service
  }

  const url = process.env.authenticationRoute  +'/login/?'+ (new URLSearchParams(urlSearchParams))
  redirect(url)
}

export const actions = {
  redirectToAuthentication() {
    redirectToAuth(this.app.context.redirect)
  },
  requestLogin({ commit, dispatch }) {
    if (process.client) {
      if (localStorage.getItem('jwt')) {
        const token = localStorage.getItem('jwt')
        commit('SET_PAYLOAD', { accessToken: token })

        let ext = this.state.auth.token.expirationAt

        if (ext) {
          ext = new Date(ext.getTime())
          ext = ext.setMinutes(ext.getMinutes() - 15)
          let today = new Date()
          today = today.getTime()

          if (today > ext) {
            dispatch('refresh')
          }

        } else {
          dispatch('refresh')
        }

      }
      else if (this.app.context.route.query.access_token) {
        if (!isValidToken(this.app.context.route.query.access_token)) {
          redirectToAuth(this.app.context.redirect)
        } else {
          commit('SET_PAYLOAD', { accessToken: this.app.context.route.query.access_token })
          dispatch('refresh')

          const query = Object.assign({}, this.app.context.route.query);
          delete query.access_token;
          this.$router.replace({ query });
        }
      } else {
        redirectToAuth(this.app.context.redirect)
      }
    }
  },

  // given the current refresh token, refresh the user's access token to prevent expiry
  async refresh ({ commit, state } ) {
    const { accessToken } = state

    // make an API call using the refresh token to generate a new access token
    await this.$axios.post(process.env.authenticationRoute+'/api/auth/refresh',
      { access_token: accessToken }).then(res => {
      commit(AUTH_MUTATIONS.SET_PAYLOAD, {
        accessToken: res.data.access_token,
        createdAt: res.data.created_at,
        expirationAt: res.data.expiration_at,
        actions: res.data.actions
      })
      commit(AUTH_MUTATIONS.SET_USER, { user: res.data.user })
    })
  },

  // logout the user
  logout ({ commit, state }) {
    commit(AUTH_MUTATIONS.LOGOUT)
  },
}
