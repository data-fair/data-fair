<template lang="html">
  <v-row>
    <v-col>
      <v-row>
        <v-col
          cols="6"
          lg="3"
        >
          <v-select
            v-model="type"
            :items="typeOptions"
            label="Type"
          />
        </v-col>
        <v-spacer />
        <v-col
          cols="6"
          lg="3"
          class="pr-4"
        >
          <v-row>
            <v-btn
              fab
              outlined
              small
              @click="$refs.calendar.prev()"
            >
              <v-icon dark>
                mdi-chevron-left
              </v-icon>
            </v-btn>
            <v-spacer />
            <div
              v-if="currentDate"
              class="py-3"
            >
              <span v-if="type === 'month'">{{ currentDate | moment('MMMM YYYY') }}</span>
              <span v-else>{{ currentDate | moment('LL') }}</span>
            </div>
            <v-spacer />
            <v-btn
              fab
              outlined
              small
              @click="$refs.calendar.next()"
            >
              <v-icon dark>
                mdi-chevron-right
              </v-icon>
            </v-btn>
          </v-row>
        </v-col>
      </v-row>

      <v-row>
        <v-col cols="12">
          <v-card :height="calendarHeight">
            <v-calendar
              v-if="currentDate && eventsPerDays"
              ref="calendar"
              v-model="currentDate"
              locale="fr-fr"
              color="primary"
              :type="type"
              @click:date="setDay"
            >
              <!-- Week/Day only slots -->
              <template v-slot:dayHeader="{ date }">
                <div
                  v-for="event in (eventsPerDays[date] || []).filter(e => e.wholeDay)"
                  :key="event.data._id"
                  v-ripple
                  class="cal-event"
                  v-html="event.data[titleProp]"
                />
              </template>
              <template v-slot:dayBody="{ date, timeToY, minutesToPixels }">
                <!-- timed events -->
                <div
                  v-for="event in (eventsPerDays[date] || []).filter(e => !e.wholeDay)"
                  :key="event.data._id"
                  :style="{ top: timeToY(event.time) + 'px', height: minutesToPixels(event.duration) + 'px' }"
                  class="cal-event with-time"
                  v-html="event.data[titleProp]"
                />
              </template>
              <!-- Month only slot -->
              <template v-slot:day="{ date }">
                <div
                  v-for="event in eventsPerDays[date]"
                  :key="event.data._id"
                  v-ripple
                  class="cal-event"
                  v-html="event.data[titleProp]"
                />
              </template>
            </v-calendar>
          </v-card>
        </v-col>
      </v-row>
    </v-col>
  </v-row>
</template>

<script>
  import { mapState, mapGetters } from 'vuex'
  import eventBus from '~/event-bus'
  const moment = require('moment')
  require('moment-timezone')

  export default {
    props: ['heightMargin'],
    data: () => ({
      calendarHeight: 0,
      data: null,
      type: 'month',
      currentDate: null,
      today: new Date().toISOString(),
      typeOptions: [{ text: 'Jour', value: 'day' }, { text: 'Semaine', value: 'week' }, { text: 'Mois', value: 'month' }],
    }),
    computed: {
      ...mapState(['env']),
      ...mapState('dataset', ['dataset']),
      ...mapGetters('dataset', ['resourceUrl']),
      startDateProp() {
        return this.dataset.schema.find(f => f['x-refersTo'] === 'https://schema.org/startDate').key
      },
      endDateProp() {
        return this.dataset.schema.find(f => f['x-refersTo'] === 'https://schema.org/endDate').key
      },
      titleProp() {
        return this.dataset.schema.find(f => f['x-refersTo'] === 'http://www.w3.org/2000/01/rdf-schema#label').key
      },
      descProp() {
        return this.dataset.schema.find(f => f['x-refersTo'] === 'http://schema.org/description').key
      },
      eventsPerDays() {
        if (!this.data) return
        const eventsPerDays = {}
        this.data.forEach(item => {
          const startDate = moment(item[this.startDateProp])
          const endDate = moment(item[this.endDateProp])

          // check if the event is made of round days in original calendar timezone
          let wholeDay = false
          if (this.dataset.timeZone) {
            const startTZ = startDate.clone().tz(this.dataset.timeZone).format('HH:mm')
            const endTZ = endDate.clone().tz(this.dataset.timeZone).format('HH:mm')
            if (item[this.endDateProp] !== item[this.startDateProp] && startTZ === '00:00' && endTZ === '00:00') {
              wholeDay = true
            }
          }

          let date = startDate
          while (date < endDate) {
            const day = date.format('YYYY-MM-DD')
            eventsPerDays[day] = eventsPerDays[day] || []
            const event = { data: item, wholeDay }

            if (!wholeDay) {
              const todayStart = day === startDate.format('YYYY-MM-DD') ? startDate : moment(date).startOf('day')
              const todayEnd = day === endDate.format('YYYY-MM-DD') ? endDate : moment(date).endOf('day')
              event.time = todayStart.format('HH:mm')
              event.duration = Math.round(moment.duration(todayEnd.diff(todayStart)).asMinutes())
              // check if the event covers the full day in current time zone
              if (event.time === '00:00' && event.duration === 1440) event.wholeDay = true
            }

            eventsPerDays[day].push(event)
            date = date.add(1, 'days')
          }
        })
        return eventsPerDays
      },
    },
    async mounted() {
      this.refresh()
      this.calendarHeight = Math.max(window.innerHeight - this.$el.getBoundingClientRect().top - this.heightMargin - 76, 300)
      if (this.today > this.dataset.timePeriod.startDate && this.today < this.dataset.timePeriod.endDate) {
        this.currentDate = moment(this.today).format('YYYY-MM-DD')
      } else {
        this.currentDate = moment(this.dataset.timePeriod.startDate).format('YYYY-MM-DD')
      }
    },
    methods: {
      async refresh() {
        try {
          this.data = (await this.$axios.$get(this.resourceUrl + '/lines', { params: { size: 10000, sort: this.startDateProp } })).results
        } catch (error) {
          eventBus.$emit('notification', { error })
        }
      },
      setDay({ date }) {
        this.currentDate = date
        if (this.type === 'month') this.type = 'week'
        else if (this.type === 'week') this.type = 'day'
      },
    },
  }
</script>

<style lang="css">
.cal-event {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  border-radius: 2px;
  background-color: #1867c0;
  color: #ffffff;
  border: 1px solid #1867c0;
  width: 100%;
  font-size: 12px;
  padding: 3px;
  cursor: pointer;
  margin-bottom: 1px;
}

.cal-event.with-time {
  position: absolute;
  right: 4px;
  margin-right: 0px;
}
</style>
