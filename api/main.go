package main

import (
	"encoding/json"
	"fmt"
	"github.com/julienschmidt/httprouter"
	"gopkg.in/redis.v3"
	"io"
	"log"
	"net/http"
	"os"
)

type Meta struct {
	classes   []byte
	semesters []byte
	timeSlots []byte
	weeks     []byte
}

func getMeta(redisClient redis.Client) (*Meta, error) {
	rawMeta, err := redisClient.Get("meta").Result()
	if err != nil {
		return nil, fmt.Errorf("Failed to get metadata: %v", err)
	}
	var meta map[string]interface{}
	json.Unmarshal([]byte(rawMeta), &meta)

	classes, err := json.Marshal(meta["classes"])
	semesters, err := json.Marshal(meta["semesters"])
	timeSlots, err := json.Marshal(meta["timeSlots"])
	weeks, err := json.Marshal(meta["weeks"])

	return &Meta{
		classes:   classes,
		semesters: semesters,
		timeSlots: timeSlots,
		weeks:     weeks,
	}, nil
}

func main() {
	log.Printf("Starting IsItCancelled API v3")
	router := httprouter.New()
	redisHost := os.Getenv("REDIS_HOST")
	redisPort := os.Getenv("REDIS_PORT")
	if redisHost == "" {
		redisHost = "redis"
	}
	if redisPort == "" {
		redisPort = string(6379)
	}

	redisClient := redis.NewClient(&redis.Options{Addr: fmt.Sprintf("%v:%v", redisHost, redisPort)})
	router.GET("/semesters", func(w http.ResponseWriter, r *http.Request, _ httprouter.Params) {
		meta, err := getMeta(*redisClient)
		if err != nil {
			w.WriteHeader(404)
			w.Write([]byte("{\"error\": \"Not Found\"}"))
			return
		}
		w.WriteHeader(200)
		w.Write(meta.semesters)
	})
	router.GET("/semesters/:semesterId/timeSlots", func(w http.ResponseWriter, r *http.Request, params httprouter.Params) {
		meta, err := getMeta(*redisClient)
		if err != nil {
			w.WriteHeader(404)
			w.Write([]byte("{\"error\": \"Not Found\"}"))
			return
		}
		w.WriteHeader(200)
		w.Write(meta.timeSlots)
	})
	router.GET("/semesters/:semesterId/weeks", func(w http.ResponseWriter, r *http.Request, params httprouter.Params) {
		meta, err := getMeta(*redisClient)
		if err != nil {
			w.WriteHeader(404)
			w.Write([]byte("{\"error\": \"Not Found\"}"))
			return
		}
		w.WriteHeader(200)
		w.Write(meta.weeks)
	})
	router.GET("/semesters/:semesterId/classes", func(w http.ResponseWriter, r *http.Request, params httprouter.Params) {
		meta, err := getMeta(*redisClient)
		if err != nil {
			w.WriteHeader(404)
			w.Write([]byte("{\"error\": \"Not Found\"}"))
			return
		}
		w.WriteHeader(200)
		w.Write(meta.classes)
	})
	router.GET("/semesters/:semesterId/weeks/:weekId", func(w http.ResponseWriter, r *http.Request, params httprouter.Params) {
		classIds := r.URL.Query()["class_id"]
		if len(classIds) == 0 {
			w.WriteHeader(400)
			w.Write([]byte("{\"error\": \"class_id is required\"}"))
			return
		}
		classId := classIds[0]
		week, err := redisClient.Get(fmt.Sprintf("semesters:%v:weeks:%v:classes:%v", params.ByName("semesterId"), params.ByName("weekId"), classId)).Result()
		if err != nil {
			w.WriteHeader(404)
			w.Write([]byte("{\"error\": \"Not Found\"}"))
			return
		}
		w.WriteHeader(200)
		io.WriteString(w, week)
	})
	log.Fatal(http.ListenAndServe(":3003", router))
}
