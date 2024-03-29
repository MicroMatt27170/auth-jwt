// store/auth.js
export var connection = null;

// reusable aliases for mutations
export const AUTH_MUTATIONS = {
    SET_USER: 'SET_USER',
    SET_PAYLOAD: 'SET_PAYLOAD',
    LOGOUT: 'LOGOUT',
    SET_ACTIONS: 'SET_ACTIONS',
    SET_SERVICES: 'SET_SERVICES',
    SET_THUNDERFLASH_CONNECTION: 'SET_THUNDERFLASH_CONNECTION'
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
    services: [],
    actions: [],
    signalR: {
        withSignalR: process.env.thunderflashRoute != null
    }
})

export const getters = {
    // determine if the user is authenticated based on the presence of the access token
    isAuthenticated: (state) => {
        return state.accessToken && state.accessToken !== ''
    },
    bearerAuthToken() {
        return 'Bearer ' + state.accessToken
    }
}


export const mutations = {
    // store the logged in user in the state
    [AUTH_MUTATIONS.SET_USER](state, { user }) {
        state.user = user
    },
    [AUTH_MUTATIONS.SET_ACTIONS](state, { actions }) {
        state.actions = actions
    },
    [AUTH_MUTATIONS.SET_SERVICES](state, { services }) {
        state.services = services
    },
    [AUTH_MUTATIONS.SET_THUNDERFLASH_CONNECTION](state, { conn }) {
        connection = conn
    },
    // store new or updated token fields in the state
    [AUTH_MUTATIONS.SET_PAYLOAD](state, {
        accessToken,
        createdAt = null,
        expirationAt = null
    }) {
        state.accessToken = accessToken

        if (createdAt) {
            try {
                state.token.createdAt = new Date(createdAt * 1000)
                state.token.expirationAt = new Date(expirationAt * 1000)

                if (accessToken && (!state.signalR.authListen || state.signalR.authConnection == null)) {

                }
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
    [AUTH_MUTATIONS.LOGOUT](state) {
        state.accessToken = null
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
    } catch (e) {
        return false;
    }
}

function redirectToAuth(redirect) {
    const localUrl = window.location.href
    const urlSearchParams = {
        continueTo: encodeURIComponent(localUrl),
        service: (process.env.serviceKey || '')
    }

    const url = process.env.authenticationRoute + '/login/?' + (new URLSearchParams(urlSearchParams))
    redirect(url)
}


export const actions = {
    redirectToAuthentication() {
        redirectToAuth(this.app.context.redirect)
    },
    requestLogin({ commit, dispatch }) {
        let _this = this;

        let containsLocalStorageJWT = function() {
            const token = localStorage.getItem('jwt')
            commit('SET_PAYLOAD', { accessToken: token })

            let ext = _this.state.auth.token.expirationAt

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


        let containsAccessTokenQueryJWT = function() {
            if (!isValidToken(_this.app.context.route.query.access_token)) {
                if (localStorage.getItem('jwt')) {
                    containsLocalStorageJWT();
                } else {
                    redirectToAuth(_this.app.context.redirect)
                }
            } else {
                commit('SET_PAYLOAD', { accessToken: _this.app.context.route.query.access_token })
                dispatch('refresh')

                const query = Object.assign({}, _this.app.context.route.query);
                delete query.access_token;
                _this.$router.replace({ query });
            }
        }

        if (process.client) {
            if (this.app.context.route.query.access_token) {
                containsAccessTokenQueryJWT();
            } else if (localStorage.getItem('jwt')) {
                containsLocalStorageJWT();
            } else {
                redirectToAuth(this.app.context.redirect)
            }
        }
    },

    // given the current refresh token, refresh the user's access token to prevent expiry
    async refresh({ commit, state, dispatch }) {
        const { accessToken } = state

        // make an API call using the refresh token to generate a new access token
        await this.$axios.post(process.env.authenticationRoute + '/api/auth/refresh', { access_token: accessToken }).then(async res => {
            commit(AUTH_MUTATIONS.SET_PAYLOAD, {
                accessToken: res.data.access_token,
                createdAt: res.data.created_at,
                expirationAt: res.data.expiration_at
            })
            commit(AUTH_MUTATIONS.SET_USER, { user: res.data.user })
            commit(AUTH_MUTATIONS.SET_SERVICES, { services: res.data.services })
            commit(AUTH_MUTATIONS.SET_ACTIONS, { actions: res.data.actions })

            try {
                if (connection) {
                    await dispatch('refreshSignalRToken', {commit, state})
                } else if (process.env.thunderflashRoute != null && process.env.thunderflashRoute != undefined) {
                    await dispatch('initSignalR', {commit, state})
                }
            } catch (e) {
                console.log('error thunderflash')
                console.log(e)
            }
        })
    },

    // logout the user
    async logout({ commit, state }) {
        const { accessToken } = state
        await this.$axios.post(process.env.authenticationRoute + '/api/auth/logout', { access_token: accessToken }).then(res => {
            // commit(AUTH_MUTATIONS.LOGOUT)
            localStorage.removeItem('jwt')
            window.location.reload()
        })

    },

    async initSignalR({ commit, state }) {
        let route = process.env.thunderflashRoute;
        const signalR = require('@microsoft/signalr')

        let connection = new signalR.HubConnectionBuilder()
            .withUrl(route + '/hubs/authentication', {
                accessTokenFactory: () => state.accessToken,

            })
            .withAutomaticReconnect([0, 2000, 5000, 15000, 60000, 300000, null])
            .build()

        await connection.start()

        console.log('connection', connection)

        commit(AUTH_MUTATIONS.SET_THUNDERFLASH_CONNECTION, { conn: connection })
        //Init Listen

        connection.on('OnUpdateJwt', (success, msg) => {
            console.log('on update connection jwt')

        })

        connection.on('Logout', () => {
            console.log('signalr auth on logout')
            commit('logout')
        })
    },
    async refreshSignalRToken({ commit, state }) {
        const res = await connection.invoke('UpdateJwt', state.accessToken)

        console.log('refresh signalr connection', res)
    }
}
